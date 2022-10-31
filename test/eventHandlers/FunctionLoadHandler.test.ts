// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import 'mocha';
import * as sinon from 'sinon';
import { AzureFunctionsRpcMessages as rpc } from '../../azure-functions-language-worker-protobuf/src/rpc';
import { LegacyFunctionLoader } from '../../src/LegacyFunctionLoader';
import { PackageJson } from '../../src/parsers/parsePackageJson';
import { beforeEventHandlerSuite } from './beforeEventHandlerSuite';
import { TestEventStream } from './TestEventStream';
import LogCategory = rpc.RpcLog.RpcLogCategory;
import LogLevel = rpc.RpcLog.Level;

namespace Msg {
    export const receivedLoadLog: rpc.IStreamingMessage = {
        rpcLog: {
            message: 'Worker 00000000-0000-0000-0000-000000000000 received FunctionLoadRequest',
            level: LogLevel.Debug,
            logCategory: LogCategory.System,
        },
    };
}

describe('FunctionLoadHandler', () => {
    let stream: TestEventStream;
    let loader: sinon.SinonStubbedInstance<LegacyFunctionLoader>;

    before(() => {
        ({ stream, loader } = beforeEventHandlerSuite());
    });

    afterEach(async () => {
        await stream.afterEachEventHandlerTest();
    });

    it('responds to function load', async () => {
        stream.addTestMessage({
            requestId: 'id',
            functionLoadRequest: {
                functionId: 'funcId',
                metadata: {},
            },
        });
        await stream.assertCalledWith(Msg.receivedLoadLog, {
            requestId: 'id',
            functionLoadResponse: {
                functionId: 'funcId',
                result: {
                    status: rpc.StatusResult.Status.Success,
                },
            },
        });
    });

    it('handles function load exception', async () => {
        const err = new Error('Function throws error');
        err.stack = '<STACKTRACE>';

        const originalLoader = loader.load;
        try {
            loader.load = sinon.stub<[string, rpc.IRpcFunctionMetadata, PackageJson], Promise<void>>().throws(err);

            stream.addTestMessage({
                requestId: 'id',
                functionLoadRequest: {
                    functionId: 'funcId',
                    metadata: {
                        name: 'testFuncName',
                    },
                },
            });

            const message = "Worker was unable to load function testFuncName: 'Function throws error'";

            const errorRpcLog: rpc.IStreamingMessage = {
                rpcLog: {
                    message,
                    level: LogLevel.Error,
                    logCategory: LogCategory.System,
                },
            };

            await stream.assertCalledWith(Msg.receivedLoadLog, errorRpcLog, {
                requestId: 'id',
                functionLoadResponse: {
                    functionId: 'funcId',
                    result: {
                        status: rpc.StatusResult.Status.Failure,
                        exception: {
                            message,
                            stackTrace: '<STACKTRACE>',
                        },
                    },
                },
            });
        } finally {
            loader.load = originalLoader;
        }
    });
});
