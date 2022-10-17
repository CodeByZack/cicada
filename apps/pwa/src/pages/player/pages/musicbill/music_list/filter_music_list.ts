import { MusicWithIndex } from '../../../constants';

function filterMusic(keyword: string) {
  return (listMusic: MusicWithIndex) => {
    const { name, aliases, singers } = listMusic.music;
    if (
      name.toLowerCase().indexOf(keyword) > -1 ||
      aliases.find((alias) => alias.toLowerCase().includes(keyword))
    ) {
      return true;
    }
    for (const singer of singers) {
      const { name: singerName, aliases: singerAlias } = singer;
      if (
        singerName.toLowerCase().indexOf(keyword) > -1 ||
        singerAlias.toLowerCase().indexOf(keyword) > -1
      ) {
        return true;
      }
    }
    return false;
  };
}

export default (musicList: MusicWithIndex[], keyword) => {
  if (!keyword) {
    return musicList;
  }
  return musicList.filter(filterMusic(keyword));
};
