const { Telegraf } = require('telegraf');
const admin = require('firebase-admin');

// Инициализация Firebase Admin SDK (работает и локально, и на Railway)
if (!process.env.GOOGLE_CREDENTIALS) {
    console.error("❌ Переменная GOOGLE_CREDENTIALS не задана!");
    process.exit(1);
}
const serviceAccount = JSON.parse(process.env.GOOGLE_CREDENTIALS);

if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

// ТВОИ ДАННЫЕ (берутся из переменных окружения на Railway)
const BOT_TOKEN = process.env.BOT_TOKEN || '8527160088:AAGc2311QFkp6F7-Jx5k8MJfqlpvbueSl5E';
const MODERATOR_CHANNEL_ID = process.env.MODERATOR_CHANNEL_ID || '-1003814894637';
const bot = new Telegraf(BOT_TOKEN);

// Хранилище временных заявок
const pendingRequests = {};

// ---------- КОМАНДЫ ----------
bot.start(async (ctx) => {
    const startParam = ctx.message.text.split(' ')[1];
    if (startParam && startParam.startsWith('verify_')) {
        const fighterId = startParam.replace('verify_', '');
        pendingRequests[ctx.from.id] = { fighterId, step: 'waiting_photo' };
        ctx.reply('📸 Отправь фото или видео боя. Затем укажи дату и описание.');
    } 
    else if (startParam && startParam.startsWith('link_')) {
        const fighterId = startParam.replace('link_', '');
        await db.collection('fighters').doc(fighterId).update({ telegramId: ctx.from.id });
        ctx.reply('✅ Telegram привязан к твоему аккаунту! Теперь можешь подтверждать рекорды и получать уведомления.');
    }
    else {
        ctx.reply('🥊 Добро пожаловать в PRORANK!\n\n/verify — подтвердить рекорд\n/profile — мой профиль\n/challenges — мои вызовы\n/support — поддержка');
    }
});

bot.command('verify', async (ctx) => {
    const user = ctx.from;
    const fighterSnapshot = await db.collection('fighters').where('telegramId', '==', user.id).get();
    if (fighterSnapshot.empty) {
        ctx.reply('❌ Аккаунт не привязан. Зарегистрируйся на сайте и нажми "Подтвердить рекорд" в профиле.');
        return;
    }
    const fighterId = fighterSnapshot.docs[0].id;
    pendingRequests[ctx.from.id] = { fighterId, step: 'waiting_photo' };
    ctx.reply('📸 Отправь фото или видео боя, затем дату и описание.');
});

bot.command('profile', async (ctx) => {
    const user = ctx.from;
    const fighterSnapshot = await db.collection('fighters').where('telegramId', '==', user.id).get();
    if (fighterSnapshot.empty) {
        ctx.reply('❌ Аккаунт не привязан. Зарегистрируйся на сайте.');
        return;
    }
    const fighter = fighterSnapshot.docs[0].data();
    ctx.reply(`👤 *${fighter.name || 'Боец'}*\n⭐ FRS: ${fighter.frs || 0}\n🏆 Побед: ${fighter.wins || 0}\n💥 Финишей: ${fighter.finishes || 0}\n📍 Город: ${fighter.city || '—'}`, { parse_mode: 'Markdown' });
});

bot.command('challenges', async (ctx) => {
    ctx.reply('📋 Скоро здесь появятся твои вызовы на спарринги.');
});

bot.command('support', async (ctx) => {
    ctx.reply('📧 По вопросам пиши администратору: @ilez_sultygov');
});

// ---------- ПРИЁМ ФАЙЛОВ И ТЕКСТА ----------
bot.on('photo', async (ctx) => {
    const userId = ctx.from.id;
    const req = pendingRequests[userId];
    if (!req || req.step !== 'waiting_photo') return;
    const photo = ctx.message.photo.pop();
    req.photo = photo.file_id;
    req.step = 'waiting_date';
    ctx.reply('📅 Теперь укажи дату боя (ГГГГ-ММ-ДД)');
});

bot.on('video', async (ctx) => {
    const userId = ctx.from.id;
    const req = pendingRequests[userId];
    if (!req || req.step !== 'waiting_photo') return;
    const video = ctx.message.video;
    req.video = video.file_id;
    req.step = 'waiting_date';
    ctx.reply('📅 Теперь укажи дату боя (ГГГГ-ММ-ДД)');
});

bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const req = pendingRequests[userId];
    if (!req) return;

    if (req.step === 'waiting_date') {
        req.date = ctx.message.text;
        req.step = 'waiting_description';
        ctx.reply('📝 Напиши описание боя (соперник, результат, место)');
    } else if (req.step === 'waiting_description') {
        req.description = ctx.message.text;
        
        const caption = `📬 *Новая заявка на верификацию*
👤 Боец: @${ctx.from.username || 'не указан'} (ID: ${req.fighterId})
📅 Дата: ${req.date}
📝 Описание: ${req.description}`;
        
        const inlineKeyboard = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '✅ Подтвердить (+100 FRS)', callback_data: `approve_${req.fighterId}` }],
                    [{ text: '❌ Отклонить', callback_data: `reject_${req.fighterId}` }]
                ]
            }
        };
        
        if (req.photo) {
            await bot.telegram.sendPhoto(MODERATOR_CHANNEL_ID, req.photo, { caption, parse_mode: 'Markdown', ...inlineKeyboard });
        } else if (req.video) {
            await bot.telegram.sendVideo(MODERATOR_CHANNEL_ID, req.video, { caption, parse_mode: 'Markdown', ...inlineKeyboard });
        }
        
        ctx.reply('✅ Заявка отправлена модераторам. Мы проверим и сообщим.');
        delete pendingRequests[userId];
    }
});

// ---------- ОБРАБОТКА НАЖАТИЯ КНОПОК ----------
bot.action(/approve_(.+)/, async (ctx) => {
    const fighterId = ctx.match[1];
    try {
        await db.collection('fighters').doc(fighterId).update({
            frs: admin.firestore.FieldValue.increment(100),
            verifiedWins: admin.firestore.FieldValue.increment(1)
        });
        
        const fighterDoc = await db.collection('fighters').doc(fighterId).get();
        const fighter = fighterDoc.data();
        const userTelegramId = fighter.telegramId;
        if (userTelegramId) {
            await bot.telegram.sendMessage(userTelegramId, '✅ Ваша заявка подтверждена! Вам начислено +100 FRS.');
        }
        
        await ctx.reply(`✅ Бойцу добавлено +100 FRS и отправлено уведомление.`);
    } catch (error) {
        await ctx.reply(`❌ Ошибка: ${error.message}`);
    }
    await ctx.deleteMessage();
});

bot.action(/reject_(.+)/, async (ctx) => {
    const fighterId = ctx.match[1];
    
    const fighterDoc = await db.collection('fighters').doc(fighterId).get();
    const fighter = fighterDoc.data();
    const userTelegramId = fighter.telegramId;
    
    if (userTelegramId) {
        await bot.telegram.sendMessage(userTelegramId, '❌ Ваша заявка на верификацию отклонена модератором.');
    }
    
    await ctx.reply(`❌ Заявка отклонена, боец уведомлён`);
    await ctx.deleteMessage();
});

// ---------- ЗАПУСК ----------
bot.launch();
console.log('✅ Бот PRORANK запущен');