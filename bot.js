const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const { initializeApp } = require('firebase/app');
const { getFirestore, doc, updateDoc, getDoc } = require('firebase/firestore');

const TOKEN = '8527160088:AAGc2311QFkp6F7-Jx5k8MJfqlpvbueSl5E';
const MODERATOR_CHANNEL_ID = '-1003814894637';

const bot = new TelegramBot(TOKEN, { polling: true });

// Firebase
const firebaseConfig = {
    apiKey: "AIzaSyDUGYJY7pX7q02MS5SACMIIQXpjpQ97mPw",
    authDomain: "proranklive.firebaseapp.com",
    projectId: "proranklive",
    storageBucket: "proranklive.firebasestorage.app"
};
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('PRORANK Bot is running!'));
app.listen(PORT, () => console.log(`✅ Сервер запущен`));

// Привязка аккаунта
bot.onText(/\/start verify_(.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const uid = match[1];
    const telegramId = msg.from.id;
    const username = msg.from.username || msg.from.first_name;
    
    try {
        const fighterRef = doc(db, "fighters", uid);
        const fighterSnap = await getDoc(fighterRef);
        
        if (!fighterSnap.exists()) {
            await bot.sendMessage(chatId, `❌ Профиль не найден. Проверьте ссылку.`);
            return;
        }
        
        await updateDoc(fighterRef, {
            telegramId: String(telegramId),
            telegramUsername: username
        });
        
        await bot.sendMessage(chatId, 
            `✅ *Аккаунт привязан!*\n\n` +
            `👤 Боец: ${fighterSnap.data().name}\n` +
            `🔗 Telegram: @${username}\n\n` +
            `Теперь вы будете получать уведомления о вызовах.`,
            { parse_mode: 'Markdown' }
        );
    } catch (err) {
        console.error(err);
        await bot.sendMessage(chatId, `❌ Ошибка привязки. Попробуйте позже.`);
    }
});

// Остальные команды (start, профиль, рекорды и т.д.)
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    await bot.sendMessage(chatId, `🥊 Добро пожаловать в PRORANK! Используйте кнопки ниже.`, {
        reply_markup: {
            keyboard: [
                [{ text: '📊 Мой профиль' }, { text: '🏆 Подтвердить рекорд' }],
                [{ text: '⚔️ Мои вызовы' }, { text: '❓ Поддержка' }]
            ],
            resize_keyboard: true
        }
    });
});

// Добавь остальные обработчики (рекорды, вызовы и т.д.) из старой версии

console.log('🤖 Бот запущен');