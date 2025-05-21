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

    // Сначала получаем данные теста, который будем удалять
    db.get(`SELECT topic, section FROM tests WHERE id = ?`, [id], (err, test) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!test) return res.status(404).json({ error: 'Test not found' });

        // Удаляем сам тест
        db.run(`DELETE FROM tests WHERE id = ?`, [id], function(err) {
            if (err) return res.status(500).json({ error: err.message });

            // Проверяем, остались ли тесты с этой темой
            db.get(
                `SELECT COUNT(*) as count FROM tests WHERE topic = ?`,
                [test.topic],
                (err, result) => {
                    if (err) return res.status(500).json({ error: err.message });

                    // Если это был последний тест с такой темой - удаляем тему из метаданных
                    if (result.count === 0) {
                        db.run(
                            `DELETE FROM metadata WHERE type = 'topic' AND value = ?`,
                            [test.topic]
                        );
                    }

                    // Аналогично для раздела
                    db.get(
                        `SELECT COUNT(*) as count FROM tests WHERE section = ?`,
                        [test.section],
                        (err, result) => {
                            if (result.count === 0) {
                                db.run(
                                    `DELETE FROM metadata WHERE type = 'section' AND value = ?`,
                                    [test.section]
                                );
                            }
                            res.json({ success: true });
                        }
                    );
                }
            );
        });
    });
});

// Роут для получения уникальных тем
app.get('/api/topics', (req, res) => {
    db.all(`SELECT DISTINCT topic FROM tests ORDER BY topic`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows.map(row => row.topic));
    });
});

// Роут для получения уникальных разделов по теме
app.get('/api/sections', (req, res) => {
    const { topic } = req.query;
    let query = `SELECT DISTINCT section FROM tests`;
    const params = [];

    if (topic) {
        query += ` WHERE topic = ?`;
        params.push(topic);
    }

    query += ` ORDER BY section`;

    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows.map(row => row.section));
    });
});

// Роут для получения отфильтрованных тестов
app.get('/api/tests/filtered', (req, res) => {
    const { topic, section } = req.query;
    let query = `SELECT * FROM tests`;
    const params = [];
    const conditions = [];

    if (topic) {
        conditions.push(`topic = ?`);
        params.push(topic);
    }

    if (section) {
        conditions.push(`section = ?`);
        params.push(section);
    }

    if (conditions.length) {
        query += ` WHERE ` + conditions.join(' AND ');
    }

    query += ` ORDER BY createdAt DESC`;

    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Запуск сервера
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});