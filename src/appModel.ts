'use strict';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as opn from 'opn';

import { LiveServerClass } from './LiveServer';
import { StatusbarUi } from './StatusbarUi';
import { Config } from './Config';

export class AppModel {

    private IsServerRunning: boolean;
    private LiveServerInstance;

    constructor() {
        this.IsServerRunning = false;
        this.HaveAnyHTMLFile(() => {
            this.Init();
        })

    }

    public Init() {
        StatusbarUi.Init();
    }

    public Golive() {

        if (this.IsServerRunning) {
            let port = this.LiveServerInstance.address().port;
            vscode.window.showInformationMessage(`Server is already running at port ${port} ...`);
            return;
        }
        let file = this.ExtractFilePath();
        if (!file) {
            vscode.window.showInformationMessage(`Open Document...`);
            return;
        }
        vscode.workspace.saveAll().then(() => {

            if (file.HasVirtualRootError) {
                vscode.window.showErrorMessage('Invaild Path in liveServer.settings.root. live Server Starts from workspace root');
            }

            let portNo = Config.getPort;

            let ignoreFilePaths = Config.getIgnoreFiles || [];
            const workspacePath = file.WorkSpacePath || '';
            ignoreFilePaths.forEach((ignoredFilePath, index, thisArr) => {
                if (!ignoredFilePath.startsWith('/') || !ignoredFilePath.startsWith('\\')) {
                    if (process.platform === 'win32') {
                        thisArr[index] = '\\' + ignoredFilePath;
                    }
                    else {
                        thisArr[index] = '/' + ignoredFilePath;
                    }
                }

                thisArr[index] = workspacePath + thisArr[index];
            });

            let params = {
                port: portNo,
                host: '0.0.0.0',
                root: file.rootPath,
                file: null,
                open: false,
                ignore: ignoreFilePaths
            }
            this.Init();
            LiveServerClass.StartServer(params, (ServerInstance) => {
                if (ServerInstance && ServerInstance.address()) {

                    this.LiveServerInstance = ServerInstance;
                    let port = ServerInstance.address().port;
                    this.ToggleStatusBar();
                    vscode.window.showInformationMessage(`Server is Started at port : ${port}`);
                    this.openBrowser('127.0.0.1', port, file.filePathFromRoot || "");
                }
                else {
                    let port = Config.getPort;
                    vscode.window.showErrorMessage(`Error to open server at port ${port}.`);
                    this.IsServerRunning = true; //to revert
                    this.ToggleStatusBar(); //reverted
                    return;
                }

            });

        });

        StatusbarUi.Working("Starting...");
    }

    public GoOffline() {
        if (!this.IsServerRunning) {
            vscode.window.showInformationMessage(`Server is not already running`);
            return;
        }
        this.Init();
        LiveServerClass.StopServer(this.LiveServerInstance, () => {
            vscode.window.showInformationMessage('Server is now offline.');
            this.ToggleStatusBar();
            this.LiveServerInstance = null;
        });

        StatusbarUi.Working("Disposing...");

    }

    private ToggleStatusBar() {
        if (!this.IsServerRunning) {
            StatusbarUi.Offline(Config.getPort);
        }
        else {
           StatusbarUi.Live();
        }

        this.IsServerRunning = !this.IsServerRunning;
    }

    private ExtractFilePath() {
        let textEditor = vscode.window.activeTextEditor;
        if (!textEditor) return null;

        const WorkSpacePath = vscode.workspace.rootPath;
        let FullFilePath = textEditor.document.fileName;
        let documentPath = path.dirname(FullFilePath);

        //if only a single file is opened, WorkSpacePath will be NULL
        let rootPath = WorkSpacePath ? WorkSpacePath : documentPath;

        let virtualRoot = Config.getRoot;
        if (!virtualRoot.startsWith('/')) {
            virtualRoot = '/' + virtualRoot;
        }

        virtualRoot = path.join(rootPath, virtualRoot);


        let HasVirtualRootError: boolean;
        if (fs.existsSync(virtualRoot)) {
            rootPath = virtualRoot;
            HasVirtualRootError = false;
        }
        else {
            HasVirtualRootError = true;
        }

        let filePathFromRoot: string;
        if (!FullFilePath.endsWith('.html') || HasVirtualRootError || rootPath.length - path.dirname(FullFilePath || '').length > 1) {
            filePathFromRoot = null;
        }
        else {
            filePathFromRoot = FullFilePath.substring(rootPath.length, FullFilePath.length);

        }

        if (process.platform === 'win32') {
            if (!rootPath.endsWith('\\'))
                rootPath = rootPath + '\\';
        }
        else {
            if (!rootPath.endsWith('/'))
                rootPath = rootPath + '/';
        }

        return {
            HasVirtualRootError: HasVirtualRootError,
            rootPath: rootPath,
            filePathFromRoot: filePathFromRoot,
            WorkSpacePath: WorkSpacePath
        };
    }

    private HaveAnyHTMLFile(callback) {
        vscode.workspace.findFiles('**/*[.html | .htm]', '**/node_modules/**', 1).then((files) => {
            if (files !== undefined && files.length !== 0) {
                callback();
                return;
            }

            let textEditor = vscode.window.activeTextEditor;
            if (!textEditor) return;

            //If a HTML file open without Workspace
            if (vscode.workspace.rootPath === undefined && textEditor.document.languageId === 'html') {
                callback();
                return;
            }
        });
    }

    private openBrowser(host: string, port: number, path: string) {
        if (Config.getNoBrowser) return;

        let appConfig: string[] = [];
        let advanceCustomBrowserCmd = Config.getAdvancedBrowserCmdline;
        if (path.startsWith('\\') || path.startsWith('/')) {
            path = path.substring(1, path.length);
        }
        path = path.replace(/\\/gi, '/');

        if (advanceCustomBrowserCmd) {
            let commands = advanceCustomBrowserCmd.split(' ');
            commands.forEach((command) => {
                if (command) {
                    appConfig.push(command);
                }
            });
        }
        else {
            let CustomBrowser = Config.getCustomBrowser;
            let ChromeDebuggingAttachmentEnable = Config.getChromeDebuggingAttachment;

            if (CustomBrowser && CustomBrowser !== 'null') {
                appConfig.push(CustomBrowser);

                if (CustomBrowser === 'chrome' && ChromeDebuggingAttachmentEnable) {
                    appConfig.push("--remote-debugging-port=9222");
                }
            }
        }

        if (appConfig[0] && appConfig[0] === 'chrome') {
            switch (process.platform) {
                case 'darwin':
                    appConfig[0] = 'google chrome';
                    break;
                case 'linux':
                    appConfig[0] = 'google-chrome';
                    break;
                case 'win32':
                    appConfig[0] = 'chrome';
                    break;
                default:
                    appConfig[0] = 'chrome';

            }
        }
        else if (appConfig[0] && appConfig[0].startsWith("microsoft-edge")) {
            appConfig[0] = `microsoft-edge:http://${host}:${port}/${path}`;
        }

        try {
            opn(`http://${host}:${port}/${path}`, { app: appConfig || [] });
        } catch (error) {
            vscode.window.showErrorMessage(`Error to open browser. See error on console`);
            console.log("\n\nError Log to open Browser : ", error);
            console.log("\n\n");
        }
    }



    public dispose() {
        StatusbarUi.dispose();
    }
}


