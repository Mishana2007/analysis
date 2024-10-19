const TelegramBot = require('node-telegram-bot-api');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cron = require('node-cron');
require('dotenv').config();

const admin = process.env.ADMIN_ID;
const token = process.env.TELEGRAM_TOKEN;
const openaiApiKey = process.env.OPENAI_API_KEY;

const bot = new TelegramBot(token, { polling: true });

// Подключение к базе данных
let db = new sqlite3.Database('./messages.db', (err) => {
    if (err) {
        console.error('Ошибка при подключении к базе данных:', err.message);
    } else {
        console.log('Подключено к базе данных SQLite');
        db.run(`CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            username TEXT,
            chat_id INTEGER,
            chat_title TEXT,
            message_text TEXT,
            date INTEGER,
            chat_type TEXT
        )`);
    }
});

// Функция для получения сообщений по дате
function getMessagesByDateRange(days) {
    const now = Math.floor(Date.now() / 1000); // текущий timestamp в секундах
    let fromDate = now - (days * 24 * 60 * 60); // вычисляем timestamp за последние "days" дней

    // Если days == 0, это означает "все время"
    const query = days === 0
        ? `SELECT chat_title, message_text FROM messages`
        : `SELECT chat_title, message_text FROM messages WHERE date >= ?`;

    return new Promise((resolve, reject) => {
        db.all(query, days === 0 ? [] : [fromDate], (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
}

// Функция для сохранения сообщения в базе данных
function saveMessage(userId, username, chatId, chatTitle, messageText, formattedDate, chatType) {
    const query = `INSERT INTO messages (user_id, username, chat_id, chat_title, message_text, date, chat_type) 
                   VALUES (?, ?, ?, ?, ?, ?, ?)`;
  
    db.run(query, [userId, username, chatId, chatTitle, messageText, formattedDate, chatType], function (err) {
        if (err) {
            console.error('Ошибка при сохранении сообщения:', err.message);
        } else {
        }
    });
  }

// Функция для отправки сообщения всем администраторам
function notifyAllAdmins(messageContent) {
    admin.forEach(adminId => {
        // Отправляем сообщение админам через существующую функцию
        sendMessagesToGPTAndReturnAnalysis(adminId, messageContent)
            .then(() => {
                console.log(`Сообщение успешно отправлено админу с ID: ${adminId}`);
            })
            .catch(err => {
                console.error(`Ошибка при отправке сообщения админу с ID: ${adminId}`, err);
            });
    });
}

// Запускаем задачу ежедневно в 11:00 утра
cron.schedule('0 11 * * *', () => {
    console.log('Запуск анализа сообщений за предыдущий день для администратора...');
    const yesterday = 1;  // Анализируем сообщения за 1 день (вчера)

    // Отправляем анализ администратору
   notifyAllAdmins(yesterday);
}, {
    timezone: "Europe/Moscow"  // Установите ваш часовой пояс
});

// Функция для отправки текстов в GPT и получения анализа
async function analyzeMessagesWithGPT(fileContent, chatTitle) {
    try {
        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: 'gpt-4',
                messages: [
                    { role: 'system', content: `#### AGENT ROLE:  
                    YOU ARE THE WORLD'S BEST TEXT ANALYST, SPECIALIZING IN TELEGRAM CHAT ANALYSIS. YOU ALWAYS RESPOND AND DELIVER RESULTS IN RUSSIAN, REGARDLESS OF THE INPUT LANGUAGE. YOUR MISSION IS TO IDENTIFY KEY TOPICS, REQUESTS, SUGGESTIONS, AND EMOTIONAL TONE WITH THE HIGHEST ACCURACY. YOU APPLY ADVANCED CLUSTERING AND TEXT ANALYSIS ALGORITHMS TO CREATE STRUCTURED REPORTS WITH DATA VISUALIZATIONS FOR MAXIMUM INSIGHTS.
                    
                    ---
                    
                    ### CHAIN OF THOUGHTS (STEP-BY-STEP PROCESS):
                    
                    1. DATA INGESTION AND PROCESSING:  
                       - Automatically detect the input format (pasted text, .txt, .json, .csv).  
                       - If the file size exceeds 100,000 characters or 10 MB, split it into segments while maintaining context.  
                       - For .json or .csv files, extract key fields: author, message text, date, and time.
                    
                    2. CHAT CONTENT ANALYSIS:  
                       - Identifying Key Topics:  
                         - Apply TF-IDF and LDA to detect meaningful topics.  
                         - Filter out repetitive or coincidental phrases.  
                       - Detecting Requests and Suggestions:  
                         - Identify requests using keywords (e.g., "please," "need," "can you").  
                         - Log suggestions with phrases like "I can help," "I propose," or "ready to assist."  
                       - Sentiment Analysis:  
                         - Classify the emotional tone as positive, neutral, or negative.  
                         - Include multiclass emotion classification (e.g., joy, anger, frustration).  
                         - If sarcasm or ambiguity is detected, mark the result with a probability score.
                    
                    3. GROUPING MESSAGES INTO LOGICAL BLOCKS:  
                       - Use clustering algorithms (DBSCAN or K-means) to group messages into logical sections.  
                       - Consider both time proximity and thematic similarity (e.g., question and answer).  
                       - Create discussion threads to track multi-part conversations on a single topic.
                    
                    4. OUTPUT FORMATTING:  
                       - Structured Report:  
                         - List key topics with brief descriptions.  
                         - Display requests and suggestions with author names and timestamps.  
                         - Provide a percentage breakdown of message sentiment.  
                       - Example Table:  
                    
                    | Author  | Message                        | Sentiment  | Date              | Message Type   |
                    |---------|--------------------------------|------------|-------------------|----------------|
                    | @ivan   | When will the report be ready? | Neutral    | 2024-10-15 10:15  | Request        |
                    | @olga   | I can help with testing.       | Positive   | 2024-10-15 10:17  | Suggestion     |
                    
                       - Visualization:  
                         - Create pie charts to show sentiment distribution.  
                         - Generate histograms to display topic frequency.  
                         - Build timelines to track message flow over time.  
                       - Export Options: Save reports as .txt, .csv, .xlsx, or visuals as PNG.
                    
                    5. USER CONFIGURABLE FILTERS:  
                       - Filter messages by sentiment (e.g., only negative).  
                       - Search messages by keywords (e.g., "deadline").  
                       - Group messages by author or discussion threads.
                    
                    ---
                    
                    ### FINAL OUTPUT EXAMPLE:
                    - Key Topics:  
                      - Topic 1: Discussion of deadlines.  
                      - Topic 2: Clarification of project requirements.  
                    - Requests and Suggestions:  
                      - @ivan: "When will the report be ready?"  
                      - @olga: "I can help with testing this weekend."  
                    - Sentiment Analysis:  
                      - Positive: 30%  
                      - Neutral: 50%  
                      - Negative: 20%
                    
                    ---
                    
                    ### VISUALIZATIONS:  
                    - Pie Chart: Sentiment distribution.  
                    - Histogram: Topic frequency.  
                    - Timeline: Sequence of messages over time.
                    
                    ---
                    
                    ### WHAT NOT TO DO (NEGATIVE PROMPT):  
                    - DO NOT IGNORE essential elements like timestamps and author names.  
                    - DO NOT MISS ambiguous or sarcastic messages — mark them with a probability score when unsure.  
                    - DO NOT REGISTER random word overlaps as topics — use TF-IDF and LDA to ensure topic relevance.  
                    - DO NOT OMIT VISUALIZATIONS if requested — include graphs where applicable.
                    
                    ---
                    
                    ### QUALITY METRICS:  
                    - Accuracy of Request and Suggestion Detection: ≥85%.  
                    - Sentiment Analysis Accuracy: ≥80%.  
                    - False Positives: ≤10%.  
                    - Processing Time for up to 100,000 characters: ≤10 seconds.
                    ` },
                    { role: 'user', content: fileContent }
                ],
                max_tokens: 1000
            },
            {
                headers: {
                    'Authorization': `Bearer ${openaiApiKey}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        // Получаем ответ от GPT и возвращаем его
        const gptResponse = response.data.choices[0].message.content;
        return gptResponse;

    } catch (error) {
        console.error('Ошибка при анализе с GPT:', error.message);
        return null;
    }
}

// Функция для обработки сообщений и отправки их в GPT
async function sendMessagesToGPTAndReturnAnalysis(chatId) {
    const query = `SELECT chat_title, message_text FROM messages`;

    db.all(query, [], async (err, rows) => {
        if (err) {
            console.error('Ошибка при получении данных:', err.message);
            bot.sendMessage(chatId, 'Произошла ошибка при получении сообщений из базы данных.');
            return;
        }

        const messagesByChat = {};

        // Группируем сообщения по chat_title
        rows.forEach((row) => {
            const { chat_title, message_text } = row;

            if (!messagesByChat[chat_title]) {
                messagesByChat[chat_title] = [];
            }
            messagesByChat[chat_title].push(message_text);
        });

        // Обрабатываем каждый чат по отдельности
        for (let chatTitle in messagesByChat) {
            const fileName = `${chatTitle}.txt`;
            const filePath = path.join(__dirname, 'chats', fileName);

            // Записываем сообщения в файл
            const fileContent = messagesByChat[chatTitle].join('\n');
            fs.writeFileSync(filePath, fileContent, 'utf-8');

            // Отправляем файл на анализ в GPT
            const analysisResult = await analyzeMessagesWithGPT(fileContent, chatTitle);

            if (analysisResult) {
                // Сохраняем результат анализа в новый файл
                const analysisFileName = `${chatTitle}_analysis.txt`;
                const analysisFilePath = path.join(__dirname, 'chats', analysisFileName);
                fs.writeFileSync(analysisFilePath, analysisResult, 'utf-8');

                // Отправляем пользователю файл с результатом анализа
                bot.sendDocument(chatId, analysisFilePath).then(() => {
                    
                }).catch((error) => {
                    console.error(`Ошибка при отправке файла ${analysisFileName}:`, error);
                });
            } else {
                bot.sendMessage(chatId, `Не удалось проанализировать сообщения из чата "${chatTitle}".`);
            }
        }

        bot.sendMessage(chatId, 'Все файлы с анализом успешно отправлены.');
    });
}

// Обрабатываем команду /start
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;

    // Отправляем приветственное сообщение и три инлайн кнопки
    bot.sendMessage(chatId, 'Выберите период для анализа сообщений:', {
        reply_markup: {
            inline_keyboard: [
                [{ text: '1 день', callback_data: 'start_analysis_1_day' }],
                [{ text: '3 дня', callback_data: 'start_analysis_3_days' }],
                [{ text: 'Все время', callback_data: 'start_analysis_all_time' }]
            ]
        }
    });
});

// Обрабатываем нажатие на кнопки
bot.on('callback_query', (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;

    if (data === 'start_analysis_1_day') {
        bot.sendMessage(chatId, 'Начинаю анализ сообщений за 1 день...');
        sendMessagesToGPTAndReturnAnalysis(chatId, 1);  // Анализируем сообщения за 1 день
    } else if (data === 'start_analysis_3_days') {
        bot.sendMessage(chatId, 'Начинаю анализ сообщений за 3 дня...');
        sendMessagesToGPTAndReturnAnalysis(chatId, 3);  // Анализируем сообщения за 3 дня
    } else if (data === 'start_analysis_all_time') {
        bot.sendMessage(chatId, 'Начинаю анализ всех сообщений...');
        sendMessagesToGPTAndReturnAnalysis(chatId, 0);  // Анализируем все сообщения
    }
});

// Обрабатываем нажатие на кнопку "Старт"
bot.on('callback_query', (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;

    if (data === 'start_analysis') {
        bot.sendMessage(chatId, 'Начинаю анализ сообщений...');
        sendMessagesToGPTAndReturnAnalysis(chatId);
    }
});

// Закрытие подключения к базе данных
process.on('SIGINT', () => {
    db.close((err) => {
        if (err) {
            console.error('Ошибка при закрытии базы данных:', err.message);
        } else {
            console.log('Подключение к базе данных закрыто.');
        }
        process.exit(0);
    });
});

// Логируем получение всех сообщений и сохраняем их в базе данных
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const chatType = msg.chat.type;  
    const chatTitle = msg.chat.title || msg.chat.username || 'Личный чат';
    const messageText = msg.text || '(медиа или пустое сообщение)';
    const userId = msg.from.id;
    const username = msg.from.username || msg.from.first_name || 'Неизвестный';
     // Преобразуем timestamp из msg.date в нужный формат
     const unixTimestamp = msg.date * 1000; // Преобразуем секунды в миллисекунды
     const date = new Date(unixTimestamp);
 
        // Форматируем дату в строку `DD.MM.YYYY`
    const day = String(date.getDate()).padStart(2, '0');  // День с ведущим нулем
    const month = String(date.getMonth() + 1).padStart(2, '0');  // Месяц с ведущим нулем (месяцы в JS начинаются с 0)
    const year = date.getFullYear();  // Год

    const formattedDate = `${day}.${month}.${year}`;
  
    if (messageText.startsWith('/')) {
      return;
  }
  
    if (chatType === 'group' || chatType === 'supergroup') {
        saveMessage(userId, username, chatId, chatTitle, messageText, formattedDate, chatType);
    }
  });