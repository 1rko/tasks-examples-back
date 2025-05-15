const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const port = 3001;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Инициализация БД
const db = new sqlite3.Database('./test.db', (err) => {
    if (err) {
        console.error(err.message);
    }
    console.log('Connected to the test database.');
});

// Создание таблицы для вопросов и ответов
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS tests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

// Роут для сохранения теста
app.post('/api/tests', (req, res) => {
    const { question, answer } = req.body;

    db.run(
        `INSERT INTO tests (question, answer) VALUES (?, ?)`,
        [question, answer],
        function(err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json({ id: this.lastID });
        }
    );
});

// Роут для получения всех тестов
app.get('/api/tests', (req, res) => {
    db.all(`SELECT * FROM tests ORDER BY createdAt DESC`, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

// Запуск сервера
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});