//Controlador do empacotador squirrel necessario para nao executar a aplicação 2 vezes
if (require('electron-squirrel-startup')) return;

// this should be placed at top of main.js to handle setup events quickly
if (handleSquirrelEvent()) {
    // squirrel event handled and app will exit in 1000ms, so don't do anything else
    return;
}

function handleSquirrelEvent() {
    if (process.argv.length === 1) {
        return false;
    }

    const ChildProcess = require('child_process');
    const path = require('path');

    const appFolder = path.resolve(process.execPath, '..');
    const rootAtomFolder = path.resolve(appFolder, '..');
    const updateDotExe = path.resolve(path.join(rootAtomFolder, 'Update.exe'));
    const exeName = path.basename(process.execPath);

    const spawn = function (command, args) {
        let spawnedProcess, error;

        try {
            spawnedProcess = ChildProcess.spawn(command, args, {detached: true});
        } catch (error) {
        }

        return spawnedProcess;
    };

    const spawnUpdate = function (args) {
        return spawn(updateDotExe, args);
    };

    const squirrelEvent = process.argv[1];
    switch (squirrelEvent) {
        case '--squirrel-install':
        case '--squirrel-updated':
            // Optionally do things such as:
            // - Add your .exe to the PATH
            // - Write to the registry for things like file associations and
            //   explorer context menus

            // Install desktop and start menu shortcuts
            spawnUpdate(['--createShortcut', exeName]);

            setTimeout(app.quit, 1000);
            return true;

        case '--squirrel-uninstall':
            // Undo anything you did in the --squirrel-install and
            // --squirrel-updated handlers

            // Remove desktop and start menu shortcuts
            spawnUpdate(['--removeShortcut', exeName]);

            setTimeout(app.quit, 1000);
            return true;

        case '--squirrel-obsolete':
            // This is called on the outgoing version of your app before
            // we update to the new version - it's the opposite of
            // --squirrel-updated

            app.quit();
            return true;
    }
}

//Modulos Electron
const {app, Tray, Menu, nativeImage, Notification, dialog, BrowserWindow} = require('electron')
app.setAppUserModelId('Emeasoft Sistemas')
const path = require('node:path')
const childProcess = require('child_process');
const {appNotify} = require("./funcoes/notify");
const {checkInternetConnection} = require("./funcoes/checkInternet")
const { version } = require('./package.json');

//Modulos Express
const express = require('express');
const appx = express();
const {enviarDadosPowerBI} = require("./funcoes/powerbi_enviar_dados");
const {logger} = require("./setup/log")
const fs = require("fs");
const additionalData = { myKey: 'myValue' }
const gotTheLock = app.requestSingleInstanceLock(additionalData)

if (!gotTheLock) {
  app.quit()
}


//Inicialização do Electron Tray, janelas e funções do menu
app.whenReady().then(() => {
    const trayIcon = path.join(__dirname, 'assets/api-32.png');
    const nimage = nativeImage.createFromPath(trayIcon);
    const tray = new Tray(nimage);

    //Janela criada em background para manter o app funcionando. O electron encerra se todas as janelas forem fechadas
    const defaultWin = new BrowserWindow({
        show: false,
    });
    defaultWin.loadFile('about.html');

    function createAboutWindow() {
        const aboutWin = new BrowserWindow({
            width: 400,
            height: 450,
            minimizable: false,
            maximizable: false,
            icon: 'assets/api.png',
            autoHideMenuBar: true,
            webPreferences: {
                nodeIntegration: true,
            },
        });
        aboutWin.loadFile('about.html');
    }

    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Atualizar',
            type: 'normal',
            icon: nativeImage.createFromPath(path.join(__dirname, 'assets/refresh-icon-16.png')),
            click: update
        },
        {
            label: 'Parar Servidor',
            type: 'normal',
            icon: nativeImage.createFromPath(path.join(__dirname, 'assets/stop-icon-16.png')),
            click: stopServer
        },
        {
            label: 'Ver Logs',
            type: 'normal',
            icon: nativeImage.createFromPath(path.join(__dirname, 'assets/log-icon-16.png')),
            click: log
        },
        {
            label: 'Sobre',
            type: 'normal',
            icon: nativeImage.createFromPath(path.join(__dirname, 'assets/question-16.png')),
            click: () => createAboutWindow()
        },
        {
            label: 'Fechar',
            type: 'normal',
            icon: nativeImage.createFromPath(path.join(__dirname, 'assets/exit-icon-16.png')),
            click: () => stopApp()
        }
    ])

    tray.setContextMenu(contextMenu)
    tray.setToolTip('CrediMAX API')
    tray.setTitle('Emeasoft')

    if (!checkInternetConnection()) app.quit()

    const notification = new Notification({
        title: 'CrediMAX API',
        body: 'Serviço em execução',
        icon: nativeImage.createFromPath(path.join(__dirname, 'assets/api.png')),
        urgency: "critical"
    });
    notification.show()
})

//Somente para Mac
// app.on('window-all-closed', () => {
//     if (process.platform !== 'darwin') app.quit()
// })

process.on('uncaughtException', (error) => {
    // Exibe uma caixa de diálogo com a mensagem de erro sem tratamento
    logger.error(error.stack)
    dialog.showErrorBox('CrediMAX API', 'Erro inesperado. Entre em contato com o atendimento e informe o erro: \n' + error.message);
    app.quit();
});

function update() {
    if (powerbiAtivado) {
        appNotify('Enviando dados do Power BI...', 'upload.png')
        logger.info('Atualização manual dos dados Power BI')
        enviarDadosPowerBI()
    }
}

function log() {
    childProcess.execFile('notepad.exe', ['./api.log']);
}

function stopApp() {
    logger.info('Encerrou a aplicação')
    app.quit()
}

function stopServer() {
    server.close(() => {
        logger.info('Servidor Offline')
        appNotify('Servidor Offline', 'error-icon.png')
    });
}

//Configuração do servidor ExpressJS
appx.use(express.json({limit: '50mb'}));
appx.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send("Erro interno do servidor!");
});

//Variaveis de inicializacao
let pasta_entrada;
let powerbiAtivado;
const port = 3000;

//Rotas Express
appx.get('/', (req, res) => {
    res.status(200).send("Retorno da API OK!");
});

//Leitura do arquivo de configuracoes preferences.json
fs.readFile('C:\\CREDIMAX.CFG\\preferences.json', "utf8", async (err, data) => {
    if (err) {
        logger.error("Erro ao ler o arquivo de configuração");
        return;
    }
    const jsonData = await JSON.parse(data);
    pasta_entrada = await jsonData["pasta_entrada"];
    powerbiAtivado = await jsonData["powerbi_ativado"];

    if (powerbiAtivado)
        logger.info('Integração Power BI ativada')
})

//PowerBi chamada da funcao na inicializacao com atraso de 5 segundos
setTimeout(() => {
    if (powerbiAtivado) {
        appNotify('Enviando dados do Power BI...', 'upload.png')
        enviarDadosPowerBI()
    }
}, 5000);

async function timerPowerBI() {
    if (powerbiAtivado) {
        appNotify('Iniciando sincronização de dados...', 'upload.png')
        enviarDadosPowerBI()
    }
}

//Define o intervalo para fazer o envio dos dados automaticamente e teste de servidor online
setInterval(timerPowerBI, 21600000) //1 hora 3600000
setInterval(() => {
    if (!checkInternetConnection()) app.quit()
    fetch('http://localhost:3000')
        .then((response) => {
            if (response.status !== 200) {
                appNotify('Servidor parou de responder', 'error-icon.png')
            }
        })
        .catch(() => {
            appNotify('Falha interna do servidor', 'error-icon.png')
        }); // swallow exception
}, 60000);

//Start do servidor
const server = appx.listen(port, () => {
    logger.info(`**************************************`)
    logger.info(`* Servidor iniciado na porta ${port}    *`)
    logger.info(`*           Versão ${version}            *`)
    logger.info(`**************************************`)
});