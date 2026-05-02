const TelegramBot = require('node-telegram-bot-api');
const express = require('express');

const TOKEN = '8527160088:AAGc2311QFkp6F7-Jx5k8MJfqlpvbueSl5E';
const bot = new TelegramBot(TOKEN, { polling: true });

// Express сервер для Railway (чтобы не падал)
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('PRORANK Bot is running!');
});

app.listen(PORT, () => {
    console.log(`✅ Express сервер запущен на порту ${PORT}`);
});

// Обработка ошибок
process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err);
});

process.on('unhandledRejection', (err) => {
    console.error('❌ Unhandled Rejection:', err);
});

// Команда /start
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, `🥊 Добро пожаловать в PRORANK!\n\nБот для связи бойцов и загрузки фото.`);
});

// Команда /help
bot.onText(/\/help/, (msg) => {
    bot.sendMessage(msg.chat.id, `Команды:\n/start — начать\n/help — помощь\n\nСкоро: привязка профиля и уведомления о вызовах`);
});

// Приём фото
bot.on('photo', async (msg) => {
    const chatId = msg.chat.id;
    try {
        const photo = msg.photo[msg.photo.length - 1];
        const fileId = photo.file_id;
        const fileLink = await bot.getFileLink(fileId);
        bot.sendMessage(chatId, `✅ Фото получено!\n\n🔗 Ссылка: ${fileLink}`);
    } catch (err) {
        console.error('Ошибка при получении фото:', err);
        bot.sendMessage(chatId, `❌ Ошибка при обработке фото`);
    }
});

// Пинг каждые 30 секунд, чтобы бот не засыпал
setInterval(() => {
    console.log('💓 Бот жив');
}, 30000);

console.log('🤖 Бот PRORANK запущен!');