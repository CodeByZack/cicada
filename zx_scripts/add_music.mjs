#!/usr/bin/env zx
// import 'zx/globals';
import FormData from 'form-data'
import fetch from 'node-fetch'
import jsmediatags from 'jsmediatags';
import { Readable } from 'stream';
import ora from 'ora';
import path from 'path';

const SERVER_URL = "http://localhost:8000";
const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxIiwiaWF0IjoxNjczOTQ0MjQ1LCJleHAiOjE2ODk0OTYyNDV9.gnV6cyWn6s2YifyYISK0m3_VctCk-rqJPKzzBtuGyxw";
// const SERVER_URL = "http://10.168.1.100:8000";
// const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxIiwiaWF0IjoxNjczMDA4NjE3LCJleHAiOjE2ODg1NjA2MTd9.XJzFNLq_5Mj7RB4YKwWt2AYKWEurWXPsePBkjzSQLOY";
const API_PATH = {
    list_singers: '/api/self_singer_list?__v=0.67.0',
    create_music: '/api/music?__v=0.67.0',
    upload_asset: '/form/asset?__v=0.67.0',
    create_singer: '/api/singer?__v=0.67.0',
    update_music: '/api/music?__v=0.67.0',

}
const MUSIC_DIR = path.join(__dirname, "./musics");
const EXT_NAMES = ['.mp3'];
const time = new Date();
const nowTimeStr = `${time.getFullYear()}-${time.getMonth() + 1}-${time.getDay()}`;
const successLogPath = path.join(__dirname,`${nowTimeStr}-success.log`);
const errorLogPath = path.join(__dirname,`${nowTimeStr}-error.log`);


const walkSync = (currentDirPath, callback) => {
    fs.readdirSync(currentDirPath, { withFileTypes: true }).forEach(function(dirent) {
        const filePath = path.join(currentDirPath, dirent.name);
        if (dirent.isFile()) {
            callback(filePath, dirent);
        } else if (dirent.isDirectory()) {
            walkSync(filePath, callback);
        }
    });
}

const requestPool = ({
    data = [],
    maxLimit = 3,
    iteratee = () => { },
}) => {
    const executing = [];
    const enqueue = (index = 0) => {
        // 边界处理
        if (index === data.length) {
            return Promise.all(executing);
        }
        // 每次调用enqueue, 初始化一个promise
        const item = data[index];

        function itemPromise(index) {
            const promise = new Promise(async (resolve) => {
                // 处理单个节点
                await iteratee({ index, item, data });
                resolve(index);
            }).then(() => {
                // 执行结束，从executing删除自身
                const delIndex = executing.indexOf(promise);
                delIndex > -1 && executing.splice(delIndex, 1);
            });
            return promise;
        }
        // 插入executing数字，表示正在执行的promise
        executing.push(itemPromise(index));

        // 使用Promise.rece，每当executing数组中promise数量低于maxLimit，就实例化新的promise并执行
        let race = Promise.resolve();

        if (executing.length >= maxLimit) {
            race = Promise.race(executing);
        }

        // 递归，直到遍历完
        return race.then(() => enqueue(index + 1));
    };

    return enqueue();
};

const extraMetaData = (filePath) => {
    return new Promise((resolve) => {
        jsmediatags.read(filePath, {
            onSuccess: (tags) => {
                resolve({
                    lyric: tags.tags?.lyrics?.lyrics,
                    picture: tags.tags?.picture
                })
            },
            onError: () => {
                resolve({})
            }
        });
    });
};

const uploadAsset = async (formDta) => {
    const url = SERVER_URL + API_PATH.upload_asset;
    const resp = await fetch(url, { body: formDta, method: "post", headers: { authorization: token, ...formDta.getHeaders() } });
    const json = await resp.json();
    return json;
};

const listSingers = async () => {
    const url = SERVER_URL + API_PATH.list_singers;
    const resp = await fetch(url, { method: "get", headers: { authorization: token, 'Content-Type': 'application/json' } });
    const json = await resp.json();
    return json;
};

const createMusic = async (name, singerIds, sq) => {
    const url = SERVER_URL + API_PATH.create_music;
    const parmas = {
        name, singerIds: singerIds.join(','), type: 1, sq
    };
    const resp = await fetch(url, { body: JSON.stringify(parmas), method: "post", headers: { authorization: token, 'Content-Type': 'application/json' } });
    const json = await resp.json();
    return json;
};

const createSinger = async (name) => {
    const url = SERVER_URL + API_PATH.create_singer;
    const resp = await fetch(url, { method: "post", body: JSON.stringify({ name, force: false }), headers: { authorization: token, 'Content-Type': 'application/json' } });
    const json = await resp.json();
    return json;
};

const updateMusic = async (musicId, key, value) => {
    const url = SERVER_URL + API_PATH.update_music;
    const parmas = {
        id: musicId,
        key,
        value,
    };
    const resp = await fetch(url, { body: JSON.stringify(parmas), method: "put", headers: { authorization: token, 'Content-Type': 'application/json' } });
    const json = await resp.json();
    return json;
};

console.log(chalk.green('音乐文件夹地址：') + MUSIC_DIR);
const spinner = ora(chalk.blue('=======扫描音频文件中=======')).start();

const files = [];
walkSync(MUSIC_DIR,(filePath)=>{
    if(EXT_NAMES.includes(path.extname(filePath))){
        files.push(filePath);
    }
});
spinner.succeed(chalk.green(`扫描到${files.length}个音乐文件`));
const errObj = [];
const successObj = [];
const taskLogs = [];
spinner.start("=======开始创建音乐=======");

const logTaskStatus = (fileName) => (msg) => {
    let targetTask = taskLogs.find(t => t.fileName === fileName);
    if (!targetTask) {
        targetTask = { fileName, msg };
        taskLogs.push(targetTask);
    }
    targetTask.msg = msg;
    spinner.color = "blue";
    spinner.text = chalk.blue("正在上传...\n") + taskLogs.map(t => chalk.blue(t.fileName) + ":" + chalk.bgBlueBright(t.msg)).join('\n');
};

const { data: singers } = await listSingers();
await requestPool({
    data: files, iteratee: async ({ index, item }) => {
        const filePath = path.join(MUSIC_DIR, item);
        let recordLog = `《${path.basename(item)}》`;
        try {
            const baseName = item.replace(path.extname(item), "");
            const [singerName, songName] = baseName.split(' - ');
            const taskLog = logTaskStatus(item);
            let targetSinger = singers?.find(s => s?.name === singerName);
            if (!targetSinger) {
                // console.log(`歌曲：${item}，未在数据库找到对应的歌手,正在添加...`);
                taskLog('未在数据库找到对应的歌手,正在添加...');
                await sleep(1000);
                const createSingerRes = await createSinger(singerName);
                if (createSingerRes.code !== 0) {
                    errObj.push({
                        fileName: item,
                        filePath,
                        error: `创建歌手：${singerName}失败`,
                        createSingerRes
                    })
                    recordLog += `-创建歌手${singerName}失败\n`;
                    fs.appendFileSync(errorLogPath, recordLog);
                    return;
                }
                targetSinger = { id: createSingerRes.data };
                singers.push(targetSinger);
            }
            taskLog('正在上传歌曲文件')
            const form = new FormData();
            form.append('asset', fs.createReadStream(filePath));
            form.append('assetType', 'music_sq');
            const uploadResult = await uploadAsset(form);
            if (uploadResult.code !== 0) {
                errObj.push({
                    fileName: item,
                    filePath,
                    uploadResult,
                })
                recordLog += `-上传歌曲文件出错-${uploadResult.message}\n`;
                taskLog(`上传歌曲文件出错-${uploadResult.message}`);
                fs.appendFileSync(errorLogPath, recordLog);
                return;
            }
            recordLog += "-歌曲上传成功";
            taskLog('正在创建歌曲....');
            await sleep(1000);
            const createResult = await createMusic(songName, [targetSinger.id], uploadResult.data.id);

            if (createResult.code !== 0) {
                errObj.push({
                    fileName: item,
                    filePath,
                    uploadResult,
                    createResult
                })
                recordLog += `-创建歌曲出错-${createResult.message}\n`;
                taskLog(`创建歌曲出错-${createResult.message}`);
                fs.appendFileSync(errorLogPath, recordLog);
                return;
            }
            const { lyric, picture } = await extraMetaData(filePath);
            if (lyric) {
                taskLog('正在上传歌词....');
                await sleep(1000);
                const updateLryicResult = await updateMusic(createResult.data, 'lyric', [lyric]);
                if (updateLryicResult.code !== 0) {
                    taskLog('保存歌词失败');
                    recordLog += "-歌词保存失败";
                } else {
                    recordLog += "-歌词保存成功";
                    taskLog('保存歌词成功');
                }

            }

            if (picture) {
                const fileBuffer = Buffer.from(picture.data, "binary");
                const fileSize = Buffer.byteLength(fileBuffer);
                const form = new FormData();
                form.append('asset', Readable.from(Buffer.from(fileBuffer)), { filename: `${item}.jpg`, knownLength: fileSize });
                form.append('assetType', 'music_cover');
                taskLog('正在上传封面图片....');
                await sleep(1000);
                const uploadResult = await uploadAsset(form);
                const updateCoverResult = await updateMusic(createResult.data, 'cover', uploadResult.data.id);
                if (updateCoverResult.code !== 0) {
                    recordLog += "-封面保存失败";
                    taskLog('保存封面失败');
                } else {
                    recordLog += "-封面保存成功";
                    taskLog('保存封面成功');

                }
            }


            successObj.push({
                fileName: item,
                filePath,
                uploadResult,
                createResult
            })
            recordLog += "-成功创建\n";
            taskLog('成功创建歌曲');
            fs.appendFileSync(successLogPath, recordLog);
        } catch (error) {
            errObj.push({
                fileName: item,
                filePath,
                error: error.message
            })
            taskLog(`创建歌曲出错-${error.message}`);
            recordLog += `-创建歌曲出错${error.message}\n`;
            fs.appendFileSync(errorLogPath, recordLog);
        } finally {
            // 剔除当前的log对象
            const targetTaskIndex = taskLogs.findIndex(t => t.fileName === item);
            if (targetTaskIndex > -1) {
                taskLogs.splice(targetTaskIndex, 1);
            }
        }


    }
})

spinner.text = chalk.green(`上传完毕，成功${successObj.length}首,失败${errObj.length}首！`)
spinner.succeed();