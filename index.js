require('dotenv').config(); // Загрузка переменных окружения из .env файла
const TelegramBot = require('node-telegram-bot-api');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Получаем токены и ключи из переменных окружения
const token = process.env.TELEGRAM_BOT_TOKEN;
const openaiApiKey = process.env.OPENAI_API_KEY;

// Создаем экземпляр Telegram-бота
const bot = new TelegramBot(token, { polling: true });

// Подключение к базе данных SQLite
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

// Функция для сохранения сообщения в базе данных
function saveMessage(userId, username, chatId, chatTitle, messageText, date, chatType) {
    const query = `INSERT INTO messages (user_id, username, chat_id, chat_title, message_text, date, chat_type) 
                   VALUES (?, ?, ?, ?, ?, ?, ?)`;
  
    db.run(query, [userId, username, chatId, chatTitle, messageText, date, chatType], function (err) {
        if (err) {
            console.error('Ошибка при сохранении сообщения:', err.message);
        }
    });
}

// Функция для отправки текстов в GPT и получения анализа
async function analyzeMessagesWithGPT(fileContent, chatTitle) {
    try {
        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: 'gpt-4-mini-o',
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
                    - Processing Time for up to 100,000 characters: ≤10 seconds.` },
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

// Функция для обработки сообщений и отправки их в GPT для конкретного пользователя
async function sendMessagesToGPTAndReturnAnalysis(chatId) {
    const query = `SELECT chat_title, message_text FROM messages WHERE chat_id = ?`;

    db.all(query, [chatId], async (err, rows) => {
        if (err) {
            console.error('Ошибка при получении данных:', err.message);
            bot.sendMessage(chatId, 'Произошла ошибка при получении сообщений из базы данных.');
            return;
        }

        if (rows.length === 0) {
            bot.sendMessage(chatId, 'Сообщения для анализа не найдены.');
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
            const fileName = `${chatTitle}_${chatId}.txt`;
            const filePath = path.join(__dirname, 'chats', fileName);

            // Записываем сообщения в файл
            const fileContent = messagesByChat[chatTitle].join('\n');
            fs.writeFileSync(filePath, fileContent, 'utf-8');

            // Отправляем файл на анализ в GPT
            const analysisResult = await analyzeMessagesWithGPT(fileContent, chatTitle);

            if (analysisResult) {
                // Сохраняем результат анализа в новый файл
                const analysisFileName = `${chatTitle}_analysis_${chatId}.txt`;
                const analysisFilePath = path.join(__dirname, 'chats', analysisFileName);
                fs.writeFileSync(analysisFilePath, analysisResult, 'utf-8');

                // Отправляем пользователю файл с результатом анализа
                bot.sendDocument(chatId, analysisFilePath).then(() => {
                    console.log(`Файл с анализом ${analysisFileName} отправлен пользователю ${chatId}.`);
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

    // Отправляем приветственное сообщение и кнопку "Старт"
    bot.sendMessage(chatId, 'Добавьте бота к себе в чат, сделайте его администратором и нажимайте "Анализ". Важно!!! Бот анализирует новые сообщения после того как вы сделали его админом', {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'Анализ', callback_data: 'start_analysis' }]
            ]
        }
    });
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

// Закрытие подключения к базе данных при завершении процесса
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
    const date = msg.date;

    if (messageText.startsWith('/')) {
        console.log(`Команда "${messageText}" не будет сохранена.`);
        return;
    }

    if (chatType === 'group' || chatType === 'supergroup') {
        saveMessage(userId, username, chatId, chatTitle, messageText, date, chatType);
    }
});
