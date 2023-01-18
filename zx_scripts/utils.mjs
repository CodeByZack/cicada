import jsmediatags from 'jsmediatags';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from "fs";

export const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const getNowTimeStr = (needTime) => {
    const date = new Date();
    if(needTime){
        const nowTimeStr = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDay()} ${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}`
        return nowTimeStr;
    }
    const nowDateStr = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDay()}`;
    return nowDateStr;
};

export const getPaths = (musicDir) => {
    const nowTimeStr = getNowTimeStr();
    const MUSIC_DIR = path.join(__dirname, musicDir);
    const successLogPath = path.join(__dirname, `${nowTimeStr}-success.log`);
    const errorLogPath = path.join(__dirname, `${nowTimeStr}-error.log`);
    return {
        MUSIC_DIR,
        successLogPath,
        errorLogPath
    }
};

export const walkSync = (currentDirPath, callback) => {
    fs.readdirSync(currentDirPath, { withFileTypes: true }).forEach(function (dirent) {
        const filePath = path.join(currentDirPath, dirent.name);
        if (dirent.isFile()) {
            callback(filePath, dirent);
        } else if (dirent.isDirectory()) {
            walkSync(filePath, callback);
        }
    });
}

export const requestPool = ({
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

export const extraMetaData = (filePath) => {
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

export const sleep = (ms = 1000)=>new Promise((r)=>setTimeout(r,ms));