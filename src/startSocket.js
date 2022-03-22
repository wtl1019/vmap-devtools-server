const HOST = 'localhost';
const axios = require('axios');
var ws = require("ws");

var socket1;
var socket2;
var reduxDevTools = require('remotedev-server');
var socketCluster = require('socketcluster-client');

module.exports = function (ip, port) {
    /**
     * （wsServer1）:启动redux-devtools-cli，提供与插件通信的websocket服务
     */
    function startReduxDevTlServer() {
        var server = reduxDevTools({ hostname: HOST, port: port, wsEngine: 'ws' });
        console.log('*'.repeat(50))
        console.log(`插件需要配置host为：${HOST}，端口号：${port}`);
        console.log('*'.repeat(50));

        return server;
    }


    function middleClient() {
        /**
         * 执行client端，通过wsServer1与插件进行通信
         */
        socket1 = socketCluster.connect({
            hostname: HOST,
            port: port
        });

        socket1.on('connect', function (status) {
            console.log('connect', status);
            console.log(`app端通信websocket端口号为${port}`);
            console.log('*'.repeat(50))
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
                    /**
                     * 给vmap服务发送请求获取页面数据
                     */
                    socket2.emit(JSON.stringify(message));
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
            });
        }
        login();
    }

    /**
     * 获取socket链接列表json
     * 若无 ’vmap_debugtools_service‘， 则轮训json
     * 存在 ’vmap_debugtools_service‘， 则链接socket服务
     */
    function getJson() {
        axios.get(`http://${ip}:8888/json`)
            .then(response => {
                const vmapItem = response.data.filter(item => item.title === 'vmap_debugtools_service')
                if (vmapItem && vmapItem.length) {
                    connectVmapSocket(`ws://${ip}:8888/devtools/page/${vmapItem[0].id}`)
                } else {
                    retryAction(getJson, 99999, 1000)
                }
            })
            .catch(error => {
                console.log(error);
            });
    }

    /**
    * 1. 建立vmap socket链接，获取数据
    * 2. 将接收到的数据，发送给redux-server服务
    */
    const connectVmapSocket = (url) => {
        socket2 = new ws(url);

        socket2.on('open', function () {
            console.log("('**socket2 connect success !!!!");
        })

        socket2.on('message', function (data) {
            const result = JSON.parse(data.toString())
            console.log('**socket2 result====>', result)
            notifyReduxServer(result)
        })

        socket2.on("error", function (err) {
            console.log("**socket2 error: ", err);
        });

        socket2.on("close", function () {
            console.log("**socket2 close");
        });
    }


    /**
     * 格式化数据，并发送给 redux-server
     */
    const notifyReduxServer = (result) => {
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


    /**
     * 用户未打开vmap调试开关前，轮训判断
     */
    let count = 0;
    function retryAction(action, times, delay) {
        if (count < times) {
            count++;
            console.log(`【获取json通道链接】${delay / 1000}秒后重试第${count}次`);
            setTimeout(() => {
                action && action();
            }, delay);
        }
    }


    startReduxDevTlServer();
    setTimeout(function () {
        middleClient();
    }, 2000)
    setTimeout(function () {
        getJson()
    }, 4000)
};
