#!/usr/bin/env zx
// import 'zx/globals';
import FormData from 'form-data'
import fetch from 'node-fetch'
import jsmediatags from 'jsmediatags';
import { Readable } from 'stream';

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

const SERVER_URL = "http://localhost:8000";
const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxIiwiaWF0IjoxNjczODU4Mzk5LCJleHAiOjE2ODk0MTAzOTl9.mPCiFSEHAkT6BnefsE9j1Gukz2xjwnbbdMfRDvEAcJM";
const API_PATH = {
    list_singers: '/api/self_singer_list?__v=0.67.0',
    create_music: '/api/music?__v=0.67.0',
    upload_asset: '/form/asset?__v=0.67.0',
    create_singer: '/api/singer?__v=0.67.0',
    update_music: '/api/music?__v=0.67.0',

}
const MUSIC_DIR = path.join(__dirname, "./musics");
const EXT_NAMES = ['.mp3'];

const uploadAsset = async (readstream,assetType) => {
    const form = new FormData({ maxDataSize: 1024 * 1024 * 100 });
    form.append('asset', readstream);
    form.append('assetType', assetType);
    const url = SERVER_URL + API_PATH.upload_asset;
    const resp = await fetch(url, { body: form, method: "post", headers: { authorization: token, ...form.getHeaders() } });
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
    console.log(json);
    return json;
};

const updateMusic = async (musicId, key, value) => {
    const url = SERVER_URL + API_PATH.update_music;
    const parmas = {
        id: musicId,
        key,
        value,
    };
    console.log({ musicId, key });
    const resp = await fetch(url, { body: JSON.stringify(parmas), method: "put", headers: { authorization: token, 'Content-Type': 'application/json' } });
    const json = await resp.json();
    return json;
};

const { data: singers } = await listSingers();
console.log(MUSIC_DIR);
const files = (await fs.readdir(MUSIC_DIR)).filter(f => EXT_NAMES.includes(path.extname(f)));
console.log(`扫描到${files.length}个音乐文件`);
const errObj = [];
const successObj = [];
await requestPool({
    data: files, iteratee: async ({ index, item }) => {
        const filePath = path.join(MUSIC_DIR, item);
        try {
            const baseName = item.replace(path.extname(item), "");
            const [singerName, songName] = baseName.split(' - ');
            let targetSinger = singers?.find(s => s?.name === singerName);
            if (!targetSinger) {
                console.log(`歌曲：${item}，未在数据库找到对应的歌手,正在添加...`);
                const createSingerRes = await createSinger(singerName);
                if (createSingerRes.code !== 0) {
                    errObj.push({
                        fileName: item,
                        filePath,
                        error: `创建歌手：${singerName}失败`,
                        createSingerRes
                    })
                    return;
                }
                targetSinger = { id: createSingerRes.data };
            }
            console.log(`正在上传歌曲文件：${item}...`);
            const uploadResult = await uploadAsset(fs.createReadStream(filePath),'music_sq');
            if (uploadResult.code !== 0) {
                errObj.push({
                    fileName: item,
                    filePath,
                    uploadResult,
                })
                console.log(`上传歌曲：${item}，失败！错误原因：${uploadResult.message}`);
                return;
            }
            console.log(`正在创建歌曲：${item}...`);
            const createResult = await createMusic(songName, [targetSinger.id], uploadResult.data.id);

            if (createResult.code !== 0) {
                errObj.push({
                    fileName: item,
                    filePath,
                    uploadResult,
                    createResult
                })
                console.log(`创建歌曲：${item}，失败！错误原因：${createResult.message}`);
                return;
            }


            const { lyric, picture } = await extraMetaData(filePath);
            if (lyric) {

                const updateLryicResult = await updateMusic(createResult.data, 'lyric', [lyric]);
                if (updateLryicResult.code !== 0) {
                    console.log(updateLryicResult)
                    console.log(`${item} - 保存歌词失败`);
                } else {
                    console.log(`${item} - 保存歌词成功`);
                }

            }

            if (picture) {
                // const blob = new buffer.Blob([new Uint8Array(picture.data)], { type: picture.format });
                // const uploadResult = await uploadAsset(filePath);
                // fs.writeFileSync(`${item}.jpg`, new Uint8Array(picture.data).createReadStream());
                // const uploadResult = await uploadAsset(new Uint8Array(picture.data).createReadStream());
                const uploadResult = await uploadAsset(Readable.from(Buffer.from(picture.data,"binary"),'music_cover'));
                console.log(uploadResult);
                const updateCoverResult = await updateMusic(createResult.data, 'cover', uploadResult.data);

                if (updateCoverResult.code !== 0) {
                    console.log(updateCoverResult)
                    console.log(`${item} - 保存封面失败`);
                } else {
                    console.log(`${item} - 保存封面失败`);

                }
            }


            successObj.push({
                fileName: item,
                filePath,
                uploadResult,
                createResult
            })
            console.log(`成功创建歌曲：${item}！！！`);
        } catch (error) {
            console.log(error);
            errObj.push({
                fileName: item,
                filePath,
                error: error.message
            })
            console.log(`创建歌曲：${item}，失败！错误原因：${error.message}`);

        }


    }
})

fs.writeJSONSync(path.join(__dirname, "./success_songs.json"), { totalLength: `成功${successObj.length}条`, data: successObj }, { spaces: 2 });
fs.writeJSONSync(path.join(__dirname, "./error_songs.json"), { totalLength: `失败${errObj.length}条`, data: errObj }, { spaces: 2 });
