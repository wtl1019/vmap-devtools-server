const HOST = 'localhost';
const axios = require('axios');
var ws = require("ws");

var socket1;
var socket2;
var lockReconnect = false; //避免重复连接
let socketCluster = require('socketcluster-client');

/**
 * vmap服务说明：
 *   包含一个 reduxDevTools  server1，和两个客户端
 *   socket2 是用来连接json通道，该通道是用来下发真实数据的
 *   socket1 是作为中介，将json通道下发的数据转发给 server1。此客户端主要是理解清login的作用
 * 
 *  杀app进程，重连逻辑： server1， socket1 不动，只对 socket2 进行重连
 */

module.exports = function (ip, port, jsonport, clientId) {
    let appPort = jsonport
    const vmap_json_key = 'vmap_debugtools_service'
    /**
     * （wsServer1）:启动redux-devtools-cli，提供与插件通信的websocket服务
     */
    function startServer1() {
        console.log(`插件需要配置host：${HOST}，端口号${port}`);

        let reduxDevTools = require('remotedev-server');
        reduxDevTools({ hostname: HOST, port: port, wsEngine: 'ws' }).then((result) => {
            console.log('remotedev-server启动结果', result)
            if(result && result.portAlreadyUsed) {
                // startServer1()
            } else {
                // middleClient()
            }
        }, (reject) => {
            console.log(`失败原因 ${reject}`)
            startServer1()
        })
    }
    startServer1()

    /**
     * socket2 与 server1 的中介，作为数据的中间传递人, 可以认为前端链接的是它
     */
    function middleClient() {
        /**
         * 执行client端，通过wsServer1与插件进行通信
         */
        socket1 = socketCluster.connect({
            hostname: HOST,
            port: port
        });

        socket1.on('connect', function (status) {
            console.log('socket1 connect success', status);
        });
        socket1.on('disconnect', function (code) {
            console.warn('Socket disconnected with code', code);
        });
        socket1.on('error', function (error) {
            console.warn('Socket error', error);
        });

        const MAX_RETRY_TIMES = 3;
        let retryTimes = 0;
        function login() {
            socket1.emit('login', 'master', function (error, channelName) {
                function handleMessages(message) {
                    console.log('handleMessages', message)
                    switch(message.type) {
                        case 'START':
                            getJson();
                            break;
                        case 'JSONPORT_CHANGEH':
                            // APP 端口变化，client2 重连; message.state 为兼容前端代码，做最小改动，未语义化
                            appPort = message.state;
                            break;
                        default:
                            /**
                             * 给vmap服务发送请求获取页面数据
                             */
                            socket2.send(JSON.stringify(message));
                            break;
                    }
                }

                if (error) {
                    console.log('login失败');
                    console.log(error.message);
                    // 出错重试
                    if (retryTimes < MAX_RETRY_TIMES) {
                        retryTimes++;
                        console.log('3秒后重试第 ' + retryTimes + ' 次');
                        setTimeout(() => {
                            login();
                        }, 3000);
                    }
                    return;
                }
                const channel = socket1.subscribe(channelName);
                channel.watch(handleMessages);
                socket1.on(channelName, handleMessages);
                console.log('login成功');
                socket1.emit('log', { type: 'SERVERCLIENT1LOGINOK' });
            });
        }
        login();
    }

    /**
     * 获取socket链接列表json
     * 若无 ’vmap_debugtools_service‘， 则轮训json
     * 存在 ’vmap_debugtools_service‘， 连接
     */
    let timer = null;
    async function getJson() {
        const appUrl = `${ip}:${appPort}`
        try {
            const response = await axios.get(`http://${appUrl}/json`)
            if (
                response
                && response.data
                && Array.isArray(response.data)
                && response.data.length
            ) {
                const vmapItem = response.data.filter(item => item.title === vmap_json_key)
                if (vmapItem && vmapItem.length) {
                    connectVmapSourceDateServer(`ws://${appUrl}/devtools/page/${vmapItem[0].id}` + (clientId ? `?client_id=${clientId}` : ''))
                } else {
                    retryGetJson()
                }
            } else {
                retryGetJson()
            }
        } catch (error) {
            retryGetJson()
        }
    }

    function retryGetJson() {
        console.log(`***2秒后重试【getJson】***`);
        timer && clearTimeout(timer)
        timer = setTimeout(() => {
            getJson()
        }, 2000)
    }

    /**
    * 1. 建立链接，将接收到的数据，借socket1发送给redux-server服务
    */
    const connectVmapSourceDateServer = (url) => {
        socket2 = new ws(url);

        socket2.on('open', function () {
            console.log("('***socket2 connect success***");
            const message = { type: 'CONNECTION', payload: 1 }
            socket1.emit('log', message);
        })

        socket2.on('message', function (data) {
            const result = JSON.parse(data.toString())
            console.log('***socket2 result***', result)
            notifyServer1(result)
        })

        socket2.on("error", function (code, reason) {
            console.log("***socket2异常关闭*** ", code, reason);
            // 通知devtools
            const message = { type: 'DISCONNECTED', code };
            socket1.emit('log', message);
            getJson()
        });

        socket2.on("close", function () {
            console.log("***socket2关闭连接***");
            // 通知devtools
            const message = { type: 'DISCONNECTED', code: 0 };
            socket1.emit('log', message);
            // 断开时轮训连接
            getJson();
        });
    }

    /**
     * 格式化数据，发给 redux-server
     */
    const notifyServer1 = (result) => {
        // VMAP调试指令返回的数据
        if ('responseId' in result) {
            socket1.emit('log', {
                type: 'RESPONSE',
                payload: result
            });
            console.log('转发VMAP调试指令返回的数据');
            return;
        }

        // Redux数据
        const message = {
            type: 'ACTION',
            action: { action: result.action, timestamp: Date.now() },
            payload: result.state,
            id: socket1.id,
            instanceId: 'xxddddddd',
            name: 'dsfkhkdshfk'
        };
        // 通过 socket1 通知redux-dev-tools服务
        socket1.emit(socket1.id ? 'log' : 'log-noid', message);
    }

    setTimeout(function(){
        middleClient();
    }, 1000)
};
