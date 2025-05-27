const { Telegraf } = require('telegraf');
const { TOKEN } = require('./bot.config');
const serialize = require('./core/serialize');
const logger = require('./core/logger');
const Database = require('./core/database');
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const moment = require('moment');

const bot = new Telegraf(TOKEN);
const commands = new Map();
const db = new Database('database.json');

db.init().then(() => logger.info('Database siap!'));

bot.use(async (ctx, next) => {
  ctx = await serialize(ctx, bot);
  ctx.commands = commands;
  ctx.db = db;

  const time = chalk.bgHex('#4CAF50').hex('#FFFFFF')(` ${moment().format('HH:mm:ss')} `);
  const sender = chalk.hex('#87ceeb')(ctx.senderId || 'unknown-chat');
  const chat = chalk.hex('#dda0dd')(ctx.chatName || 'unknown-user');
  const body = ctx.body || 'non-text update';
  
  // Border dengan karakter box-drawing dan warna biru
  const blueBorder = chalk.hex('#1e90ff')('┏' + '━'.repeat(50) + '┓');
const blueBorderBottom = chalk.hex('#1e90ff')('┗' + '━'.repeat(50) + '┛');

  const kawaiiLog = `
${blueBorder}
[${time}] 🧩 ${chalk.bold('Message from')} ${sender} in ${chat}
 ${chalk.hex('#f08080')(body)}
${blueBorderBottom}
`;

  console.log(kawaiiLog);
  await next();
});

const walkPlugins = (dir) => {
  const files = fs.readdirSync(dir);
  for (let file of files) {
    const filepath = path.join(dir, file);
    const stat = fs.statSync(filepath);
    if (stat.isDirectory()) {
      walkPlugins(filepath);
    } else if (file.endsWith('.js')) {
      try {
        const plugin = require(path.resolve(filepath));
        if (!plugin.name || typeof plugin.run !== 'function') return;
        commands.set(plugin.name, plugin);
        bot.command(plugin.name, (ctx) => plugin.run(ctx, { db }));
        logger.success(`Loaded plugin: ${plugin.name} (${plugin.category || 'uncategorized'})`);
      } catch (e) {
        logger.error(`Gagal memuat plugin ${file}: ${e.message}`);
      }
    }
  }
};

walkPlugins(path.join(__dirname, 'plugins'));

/* bot.command(['help', 'menu'], async (ctx) => {
  let grouped = {};
  for (let [name, plugin] of commands.entries()) {
    const cat = plugin.category || 'uncategorized';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push({ name, desc: plugin.desc || '-' });
  }

  let text = '𝐌𝐞𝐧𝐮 𝐅𝐢𝐭𝐮𝐫 𝐁𝐨𝐭\n\n';
  for (let [cat, items] of Object.entries(grouped)) {
    text += `• ${cat.toUpperCase()} •\n`;
    for (let item of items) {
      text += `  /${item.name} — ${item.desc}\n`;
    }
    text += '\n';
  }

  await ctx.reply(text.trim(), {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Chat Admin ✉️', url: 'https://t.me/Toretinyy' }],
        [{ text: 'Gabung ke Grup 📢', url: 'https://t.me/+yeaAqKQ03Us1NmMx'}]
      ]
    }
  });
}); */
bot.start(async (ctx) => {
  const user = ctx.from.first_name || 'there';
  const text = `👋🏻 Hay ${user}~!
🎉 Selamat datang di 𝐎𝐒𝐈𝐍𝐓𝐫𝐢𝐱! 🔍

𝐎𝐒𝐈𝐍𝐓𝐫𝐢𝐱 adalah tools yang dirancang khusus untuk membantumu dalam berbagai keperluan OSINT (Open Source Intelligence) 🧠🕵️‍♂️

📥 𝐎𝐒𝐈𝐍𝐓𝐫𝐢𝐱 mengambil data dari mana?
1️⃣ Scraping 🕷️
2️⃣ API 🔗
3️⃣ Kebocoran Database 💥
4️⃣ Realtime Database 📡
5️⃣ Arsip Google 🗂️

⚠️ Penyalahgunaan Tools OSINTrix, tanggung jawab developer?
🚫 TIDAK! Semua bentuk penyalahgunaan adalah di luar tanggung jawab developer.

🙏 Terima kasih telah menggunakan OSINTrix!
Semoga bermanfaat dan gunakan dengan bijak! 💻✨`;
               
  await ctx.replyWithMarkdown(text, {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '🕵️ Menu OSINT', callback_data: 'menu_osint' },
        ],
        [
          { text: '👑 Menu Owner', callback_data: 'menu_owner' },
          { text: '👤 Menu User', callback_data: 'menu_user' }
        ],
        [
          { text: '📋 All Menu', callback_data: 'menu_all' }
        ],
        [
          { text: 'Chat Admin ✉️', url: 'https://t.me/Toretinyy' },
          { text: 'Gabung Grup 📢', url: 'https://t.me/+yeaAqKQ03Us1NmMx' }
        ]
      ]
    }
  });
});

// Handler untuk masing-masing menu
const generateMenu = (category = null) => {
  let grouped = {};
  
  for (let [name, plugin] of commands.entries()) {
    const cat = plugin.category || 'uncategorized';
    if (!category || cat.toLowerCase() === category.toLowerCase()) {
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push({ name, desc: plugin.desc || '-' });
    }
  }

  let text = category 
    ? `𝐌𝐞𝐧𝐮 ${category.toUpperCase()}\n\n` 
    : '𝐌𝐞𝐧𝐮 𝐅𝐢𝐭𝐮𝐫 𝐁𝐨𝐭 𝐎𝐒𝐈𝐍𝐓𝐫𝐢𝐱\n\n';

  for (let [cat, items] of Object.entries(grouped)) {
    text += `• ${cat.toUpperCase()} •\n`;
    for (let item of items) {
      text += `├/${item.name}\n`;
    }
    text += '\n';
  }

  return text.trim();
};

// Handler untuk tombol menu
bot.action('menu_osint', async (ctx) => {
  await ctx.answerCbQuery();
  const text = `𝐌𝐞𝐧𝐮 𝐎𝐒𝐈𝐍𝐓𝐫𝐢𝐱 

📃 Search by NIK
├  /ceknik —  (10 limit)
└  /ceknik2 —  (2 limit)

📱 Search by Number
├ /cekewallet —  (5 limit)
└ /cekrekening —  (5 limit)

👤 Search by Nama Lengkap
└ /cekpelajar (3 limit)`
  await ctx.reply(text, {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '👑 Menu Owner', callback_data: 'menu_owner' }
        ],
        [
          { text: '👤 Menu User', callback_data: 'menu_user' },
          { text: '📋 All Menu', callback_data: 'menu_all' }
        ],
        [
          { text: 'Chat Admin ✉️', url: 'https://t.me/Toretinyy' },
          { text: 'Gabung Grup 📢', url: 'https://t.me/+yeaAqKQ03Us1NmMx' }
        ]
      ]
    }
  });
});


bot.action('menu_owner', async (ctx) => {
  await ctx.answerCbQuery();
  const menuText = generateMenu('owner');
  await ctx.reply(menuText, {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '🕵️ Menu OSINT', callback_data: 'menu_osint' },
        ],
        [
          { text: '👤 Menu User', callback_data: 'menu_user' },
          { text: '📋 All Menu', callback_data: 'menu_all' }
        ],
        [
          { text: 'Chat Admin ✉️', url: 'https://t.me/Toretinyy' },
          { text: 'Gabung Grup 📢', url: 'https://t.me/+yeaAqKQ03Us1NmMx' }
        ]
      ]
    }
  });
});

bot.action('menu_user', async (ctx) => {
  await ctx.answerCbQuery();
  const menuText = generateMenu('user');
  await ctx.reply(menuText, {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '🕵️ Menu OSINT', callback_data: 'menu_osint' },
        ],
        [
          { text: '👑 Menu Owner', callback_data: 'menu_owner' },
          { text: '📋 All Menu', callback_data: 'menu_all' }
        ],
        [
          { text: 'Chat Admin ✉️', url: 'https://t.me/Toretinyy' },
          { text: 'Gabung Grup 📢', url: 'https://t.me/+yeaAqKQ03Us1NmMx' }
        ]
      ]
    }
  });
});

bot.action('menu_all', async (ctx) => {
  await ctx.answerCbQuery();
  const menuText = generateMenu();
  await ctx.reply(menuText, {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '🕵️ Menu OSINT', callback_data: 'menu_osint' },
        ],
        [
          { text: '👑 Menu Owner', callback_data: 'menu_owner' },
          { text: '👤 Menu User', callback_data: 'menu_user' }
        ],
        [
          { text: 'Chat Admin ✉️', url: 'https://t.me/Toretinyy' },
          { text: 'Gabung Grup 📢', url: 'https://t.me/+yeaAqKQ03Us1NmMx' }
        ]
      ]
    }
  });
});

bot.launch().then(() => logger.info('Bot aktif!'));
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));