#!/usr/bin/env node
const program = require('commander');
const startSocket = require("../src/startSocket");


program.version('0.0.1');
program
    .option('-p, --port <int>', '启动socket服务的端口');
program.parse(process.argv);

let socketPort = 6000;
if (program.port) {
    socketPort = program.port;
}

startSocket(socketPort);
