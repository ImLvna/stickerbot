import { Client, GatewayIntentBits as Intents } from 'discord.js';
import fs from 'fs';
import FormData from 'form-data';
import Axios from 'axios';
import sharp from 'sharp';
import { Readable } from 'stream';

interface Config {
  DISCORD_TOKEN: string;
  CHANNEL_ID: string;
  TELEGRAM_TOKEN: string;
  STICKER_PACK_NAME: string;
  STICKER_PACK_TITLE: string;
  STICKER_PACK_AUTHOR_ID: string;
  STICKER_PACK_EMOJIS: string;
}
const config = JSON.parse(fs.readFileSync('config.json', 'utf8')) as Config;

const regexes = {
  normalEmoji: /<:\w+:\d+>/g,
  animatedEmoji: /<a:\w+:\d+>/g,
  fakemoji: /https:\/\/cdn\.discordapp\.com\/emojis\/\d+\.(?:png|webp|gif)(?:\?(?:(?:(?:size=(?:(?:32)|(?:48)|(?:64)|(?:128)|(?:160)|(?:256)|(?:512)))|(?:name=[\w%]+)|(?:quality=lossless))&?)*)?/g
}

const bot = new Client({ intents: [
  Intents.Guilds,
  Intents.GuildMessages,
  Intents.MessageContent,
  Intents.GuildEmojisAndStickers
] });

const axios = Axios.create({
  baseURL: `https://api.telegram.org/bot${config.TELEGRAM_TOKEN}/`
});

let telegramname = '';
let isStickerPackCreated = false;

axios.get('getMe').then((res) => {
  telegramname = res.data.result.username;
  axios.get('getStickerSet', {
    params: {
      name: `${config.STICKER_PACK_NAME}_by_${telegramname}`
    }
  }).then((res) => {
    isStickerPackCreated = true;
  }).catch((err) => {
    isStickerPackCreated = false;
  });
});

let loggedIn = false;
bot.on('ready', () => {
  console.log(`Logged in as ${bot.user?.tag}!`);
  loggedIn = true;
});

bot.on('messageCreate', async (msg) => {
  if (!loggedIn) return;
  if (msg.author.bot) return;
  if (msg.channelId !== config.CHANNEL_ID) return;

  let info: string[] = [];
  let emojiLinks: string[] = [];

  let normalEmoji = msg.content.match(regexes.normalEmoji);

  if (normalEmoji) {
    emojiLinks = normalEmoji.map((emoji) => { return `https://cdn.discordapp.com/emojis/${emoji.match(/\d+/)}.png?size=512` });
  }

  let animatedEmoji = msg.content.match(regexes.animatedEmoji);

  if (animatedEmoji) {
    emojiLinks = emojiLinks.concat(animatedEmoji.map((emoji) => { return `https://cdn.discordapp.com/emojis/${emoji.match(/\d+/)}.gif?size=512` }));
  }

  let fakemoji = msg.content.match(regexes.fakemoji);

  if (fakemoji) {
    emojiLinks = emojiLinks.concat(fakemoji.map((emoji) => {
      // Convert all webp emoji to png,
      // discord cdn hosts both so you can just change the extension
      emoji = emoji.replace(/\.webp/g, '.png')

      // Remove any query params
      emoji = emoji.replace(/\?.*/g, '');

      // Add the appropriate params
      emoji += '?size=512&quality=lossless';

      if (emoji.includes('.gif')) {
        info.push(`Sticker \`${emoji}\` is animated, but it will be converted to a static image.`);
        emoji = emoji.replace(/\.gif/g, '.png');
      }
      return emoji;
    }));
  }

  if (emojiLinks.length > 0) {
    info.push(`Found ${emojiLinks.length} emoji in your message, downloading...`);
    msg.channel.send(info.join('\n'));
  }


  if (!isStickerPackCreated) {
    msg.channel.send(`Sticker pack not found, creating...`);
    const data = new FormData();
    data.append('user_id', config.STICKER_PACK_AUTHOR_ID);
    data.append('name', `${config.STICKER_PACK_NAME}_by_${telegramname}`);
    data.append('title', config.STICKER_PACK_TITLE);
    data.append('emojis', config.STICKER_PACK_EMOJIS);
    data.append('sticker_type', 'regular');

    const res = await axios.get(emojiLinks[0], { responseType: 'arraybuffer' });
    const buffer = Buffer.from(res.data, 'binary');
    const resized = await sharp(buffer).resize(512, 512).toBuffer();
    data.append('png_sticker', Readable.from(resized), {
      filename: 'sticker0.png',
      contentType: 'image/png'
    });
    await axios.post('createNewStickerSet', data).catch((err) => {
      console.log(err);
      msg.channel.send(`Error creating sticker pack: ${err.response.data.description}`);
    });

    isStickerPackCreated = true;
    emojiLinks.shift();

    msg.channel.send(`Sticker pack created! https://t.me/addstickers/${config.STICKER_PACK_NAME}_by_${telegramname}`);
  }

  for await (const emoji of emojiLinks) {
    const res = await axios.get(emoji, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(res.data, 'binary');
    const resized = await sharp(buffer).resize(512, 512).toBuffer();

    const data = new FormData();
    data.append('user_id', config.STICKER_PACK_AUTHOR_ID);
    data.append('name', `${config.STICKER_PACK_NAME}_by_${telegramname}`);
    data.append('emojis', config.STICKER_PACK_EMOJIS);
    data.append('png_sticker', Readable.from(resized), {
      filename: `sticker.png`,
      contentType: 'image/png'
    });
    await axios.post('addStickerToSet', data).catch((err) => {
      msg.channel.send(`Failed to add sticker ${emoji} to pack!`);
      console.log(err);
    });
    msg.channel.send(`Added sticker ${emoji} to pack!`);
  };
});

bot.login(config.DISCORD_TOKEN);