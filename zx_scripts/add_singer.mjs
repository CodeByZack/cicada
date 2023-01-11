#!/usr/bin/env zx
import 'zx/globals';
import fetch from 'node-fetch'

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

const SERVER_URL = "http://localhost:8000";
const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxIiwiaWF0IjoxNjczMzM2MTM0LCJleHAiOjE2ODg4ODgxMzR9.Mh8eGOHGH-TzGgOhyDTPnqk5Gb99PFqUfASuPUqYKRY";
const API_PATH = {
    create_singer: '/api/singer?__v=0.67.0',
}


const SINGER_JSON = path.join(__dirname, "./singers.json");

const createSinger = async (name) => {
    const url = SERVER_URL + API_PATH.create_singer;
    const resp = await fetch(url, { method: "post", body: JSON.stringify({ name, force: false }), headers: { authorization: token, 'Content-Type': 'application/json' } });
    const json = await resp.json();
    console.log(json);
    return json;
};

const singerJson = fs.readJSONSync(SINGER_JSON);
console.log(`从JSON文件里读取到了${singerJson.length}条数据！`);

const success = [];
const error = [];

await requestPool({
    data: singerJson,
    iteratee: async ({ index, item }) => {
        try {
            console.log(`正在创建歌手：${item}...`);
            const createResult = await createSinger(item);
            if (createResult.code !== 0) {
                error.push({
                    name: item,
                    createResult
                })
                console.log(`创建歌手：${item}，失败！错误原因：${createResult.message}`);
                return;
            }
            success.push({
                name: item,
                createResult
            });
            console.log(`创建歌手：${item}成功！！！`);
        } catch (error) {
            error.push({
                name: item,
                error
            })
        }
    },
    maxLimit: 10
})

fs.writeJSONSync(path.join(__dirname, "success_singers.json"), { totalLength: `成功${success.length}条`, data: success }, { spaces: 2 });
fs.writeJSONSync(path.join(__dirname, "error_singers.json"), { totalLength: `失败${error.length}条`, data: error }, { spaces: 2 });
