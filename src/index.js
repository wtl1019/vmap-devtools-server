const program = require('commander');
const startSocket = require("./startSocket");

program.version('0.0.1');
program
    .option('-p, --port <int>', '启动socket服务的端口');
program
    .option('-host, --host <int>', '启动socket服务的ip');
program
    .option('-jsonport, --jsonport <int>', '获取socket通道链接的端口');
program
    .option('-clientId, --clientId <int>', 'socket新重连标识');
    
program.parse(process.argv);

if (!program.host) {
    throw new Error('--host option is required');
}

if (!program.port) {
    throw new Error('--port option is required');
}

if (!program.jsonport) {
    throw new Error('--jsonport option is required');
}

startSocket(program.host, program.port, program.jsonport, program.clientId);
