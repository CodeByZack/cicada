import { API_PATH } from "./constant.mjs";
import fetch from 'node-fetch'


let SERVER_URL = "";
let PASS_TOKEN = "";


export const uploadAsset = async (formDta) => {
    const url = SERVER_URL + API_PATH.upload_asset;
    const resp = await fetch(url, { body: formDta, method: "post", headers: { authorization: PASS_TOKEN, ...formDta.getHeaders() } });
    const json = await resp.json();
    return json;
};

export const listSingers = async () => {
    const url = SERVER_URL + API_PATH.list_singers;
    const resp = await fetch(url, { method: "get", headers: { authorization: PASS_TOKEN, 'Content-Type': 'application/json' } });
    const json = await resp.json();
    return json;
};

export const createMusic = async (name, singerIds, sq) => {
    const url = SERVER_URL + API_PATH.create_music;
    const parmas = {
        name, singerIds: singerIds.join(','), type: 1, sq
    };
    const resp = await fetch(url, { body: JSON.stringify(parmas), method: "post", headers: { authorization: PASS_TOKEN, 'Content-Type': 'application/json' } });
    const json = await resp.json();
    return json;
};

export const createSinger = async (name) => {
    const url = SERVER_URL + API_PATH.create_singer;
    const resp = await fetch(url, { method: "post", body: JSON.stringify({ name, force: false }), headers: { authorization: PASS_TOKEN, 'Content-Type': 'application/json' } });
    const json = await resp.json();
    return json;
};

export const updateMusic = async (musicId, key, value) => {
    const url = SERVER_URL + API_PATH.update_music;
    const parmas = {
        id: musicId,
        key,
        value,
    };
    const resp = await fetch(url, { body: JSON.stringify(parmas), method: "put", headers: { authorization: PASS_TOKEN, 'Content-Type': 'application/json' } });
    const json = await resp.json();
    return json;
};


export const setTokenAndUrl = (_SERVER_URL, _PASS_TOKEN) => {
    SERVER_URL = _SERVER_URL;
    PASS_TOKEN = _PASS_TOKEN;
};