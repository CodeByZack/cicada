#!/usr/bin/env zx
// import 'zx/globals';
import FormData from 'form-data';
import { Readable } from 'stream';
import ora from 'ora';
import path from 'path';
import chalk from 'chalk';
import fs from 'fs';
import parseArgs from "minimist";
import {
    setTokenAndUrl,
    listSingers,
    createMusic,
    createSinger,
    updateMusic,
    uploadAsset,
} from './api.mjs';
import { getPaths, walkSync, requestPool, extraMetaData, sleep, getNowTimeStr, __dirname } from './utils.mjs';
import { EXT_NAMES } from './constant.mjs';

const argv = parseArgs(process.argv.slice(2));
const configPath = path.join(__dirname, argv.c || './config.json');
console.log(chalk.green('config文件地址：') + chalk.blue.underline(configPath));
const configStr = fs.readFileSync(configPath).toString("utf-8");
const config = JSON.parse(configStr);
setTokenAndUrl(config.SERVER_URL, config.token);

const PATHS = getPaths('./musics');
const { MUSIC_DIR, errorLogPath, successLogPath } = PATHS;
console.log(chalk.green('音乐文件夹地址：') + chalk.blue.underline(MUSIC_DIR));
const spinner = ora(chalk.blue('=======扫描音频文件中=======')).start();

console.time("知了音乐上传脚本");

const files = [];
walkSync(MUSIC_DIR, (filePath) => {
    if (EXT_NAMES.includes(path.extname(filePath))) {
        spinner.text = filePath;
        files.push(filePath);
    }
});
spinner.succeed(chalk.green(`扫描到${files.length}个音乐文件`));


const errObj = [];
const successObj = [];
const taskLogs = [];
spinner.start('=======开始创建音乐=======');

const logTaskStatus = (fileName) => (msg) => {
    let targetTask = taskLogs.find((t) => t.fileName === fileName);
    if (!targetTask) {
        targetTask = { fileName, msg };
        taskLogs.push(targetTask);
    }
    targetTask.msg = msg;
    spinner.color = 'blue';
    spinner.text =
        chalk.blue('正在上传...\n') +
        taskLogs
            .map((t) => `${chalk.blue(t.fileName)}:${chalk.bgBlueBright(t.msg)}`)
            .join('\n');
};


const main = async () => {
    const { data: singers } = await listSingers();

    const processTask = async ({ item }) => {
        const baseName = path.basename(item);
        let recordLog = baseName;
        const singerAndSongName = baseName.replace(path.extname(item), '');
        const [singerName, songName] = singerAndSongName.split(' - ');
        const taskLog = logTaskStatus(baseName);

        const checkSinger = async () => {
            let targetSinger = singers?.find((s) => s?.name === singerName);
            if (targetSinger) return targetSinger;
            taskLog(`未在数据库找到对应的歌手${singerName},正在添加...`);
            const createSingerRes = await createSinger(singerName);
            if (createSingerRes.code !== 0) {
                throw new Error(`创建歌手${singerName}失败-${createSingerRes.message}`);
            }
            targetSinger = { id: createSingerRes.data };
            singers.push(targetSinger);
            return targetSinger;
        };

        const uplodaMusicFile = async () => {
            taskLog('正在上传歌曲文件');
            const form = new FormData();
            form.append('asset', fs.createReadStream(item));
            form.append('assetType', 'music_sq');
            const uploadResult = await uploadAsset(form);
            if (uploadResult.code !== 0) {
                throw new Error(`上传歌曲文件出错-${uploadResult.message}`);
            }
            recordLog += '-歌曲上传成功';
            return uploadResult.data.id;
        };

        const createMusicRecord = async (singer, musicFileId) => {
            taskLog('正在创建歌曲....');
            const createResult = await createMusic(songName, [singer.id], musicFileId);
            if (createResult.code !== 0) {
                throw new Error(`创建歌曲出错-${createResult.message}`);
            }
            return createResult.data;
        };

        const updateMetaData = async (musicRecordId) => {
            const { lyric, picture } = await extraMetaData(item);
            if (lyric) {
                taskLog('正在上传歌词....');
                const updateLryicResult = await updateMusic(musicRecordId, 'lyric', [
                    lyric,
                ]);
                if (updateLryicResult.code !== 0) {
                    taskLog('保存歌词失败');
                    recordLog += '-歌词保存失败';
                } else {
                    recordLog += '-歌词保存成功';
                    taskLog('保存歌词成功');
                }
            }

            if (picture) {
                const fileBuffer = Buffer.from(picture.data, 'binary');
                const fileSize = Buffer.byteLength(fileBuffer);
                const form = new FormData();
                form.append('asset', Readable.from(Buffer.from(fileBuffer)), {
                    filename: `${item}.jpg`,
                    knownLength: fileSize,
                });
                form.append('assetType', 'music_cover');
                taskLog('正在上传封面图片....');
                const uploadResult = await uploadAsset(form);
                const updateCoverResult = await updateMusic(
                    musicRecordId,
                    'cover',
                    uploadResult.data.id,
                );
                if (updateCoverResult.code !== 0) {
                    recordLog += '-封面保存失败';
                    taskLog('保存封面失败');
                } else {
                    recordLog += '-封面保存成功';
                    taskLog('保存封面成功');
                }
            }
        };

        try {
            const singer = await checkSinger();
            // await sleep();
            const musicFileId = await uplodaMusicFile();
            // await sleep();
            const musicRecordId = await createMusicRecord(singer, musicFileId);
            // await sleep();
            await updateMetaData(musicRecordId);
            await sleep();
            successObj.push({
                fileName: baseName,
                filePath: item,
            });
            recordLog += `-成功创建-${getNowTimeStr(true)}\n`;
            taskLog('成功创建歌曲');
            fs.appendFileSync(successLogPath, recordLog);
        } catch (error) {
            errObj.push({
                fileName: baseName,
                filePath: item,
                error: error.message,
            });
            taskLog(`创建歌曲出错-${error.message}`);
            recordLog += `-创建歌曲出错-${error.message}-${getNowTimeStr(true)}\n`;
            fs.appendFileSync(errorLogPath, recordLog);
        } finally {
            // 剔除当前的log对象
            const targetTaskIndex = taskLogs.findIndex((t) => t.fileName === baseName);
            if (targetTaskIndex > -1) {
                taskLogs.splice(targetTaskIndex, 1);
            }
        }
    };

    await requestPool({ data: files, iteratee: processTask });

    spinner.text = chalk.green(`上传完毕，成功${successObj.length}首,失败${errObj.length}首！`);
    spinner.succeed();
    console.timeEnd("知了音乐上传脚本");
};

main();