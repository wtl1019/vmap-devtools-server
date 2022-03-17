const program = require('commander');
const startSocket = require("./startSocket");

program.version('0.0.1');
program
    .option('-p, --port <int>', '启动socket服务的端口');
program.parse(process.argv);

if (!program.host) {
    throw new Error('--host option is required');
}

if (!program.port) {
    throw new Error('--port option is required');
}

startSocket(program.host, program.port);
