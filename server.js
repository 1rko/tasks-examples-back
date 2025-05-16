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

// Создание таблиц
db.serialize(() => {
    // Таблица тестов
    db.run(`CREATE TABLE IF NOT EXISTS tests (
                                                 id INTEGER PRIMARY KEY AUTOINCREMENT,
                                                 topic TEXT NOT NULL,
                                                 section TEXT NOT NULL,
                                                 question TEXT NOT NULL,
                                                 answer TEXT NOT NULL,
                                                 createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);

    // Таблица для хранения уникальных тем и разделов (для автодополнения)
    db.run(`CREATE TABLE IF NOT EXISTS metadata (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,  
    value TEXT NOT NULL,
    UNIQUE(type, value)
  )`);
});


// Роут для сохранения теста
app.post('/api/tests', (req, res) => {
    const { topic, section, question, answer } = req.body;

    // Сохраняем тест
    db.run(
        `INSERT INTO tests (topic, section, question, answer) VALUES (?, ?, ?, ?)`,
        [topic, section, question, answer],
        function(err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }

            // Сохраняем тему и раздел для автодополнения (игнорируем дубликаты)
            db.run(
                `INSERT OR IGNORE INTO metadata (type, value) VALUES (?, ?), (?, ?)`,
                ['topic', topic, 'section', section],
                (err) => {
                    if (err) {
                        console.error('Error saving metadata:', err);
                    }
                    res.json({ id: this.lastID });
                }
            );
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

// Роут для получения тем и разделов (для автодополнения)
app.get('/api/metadata', (req, res) => {
    db.all(
        `SELECT type, value FROM metadata ORDER BY type, value`,
        [],
        (err, rows) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }

            // Форматируем данные для удобства использования на клиенте
            const result = {
                topics: rows.filter(r => r.type === 'topic').map(r => r.value),
                sections: rows.filter(r => r.type === 'section').map(r => r.value)
            };

            res.json(result);
        }
    );
});

// Роут для удаления теста
app.delete('/api/tests/:id', (req, res) => {
    const { id } = req.params;

    db.run(
        `DELETE FROM tests WHERE id = ?`,
        [id],
        function(err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            if (this.changes === 0) {
                return res.status(404).json({ error: 'Test not found' });
            }
            res.json({ success: true });
        }
    );
});

// Запуск сервера
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});