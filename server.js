const express = require("express");
const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "gerador-gabarito-seguro";
const DATABASE_URL = process.env.DATABASE_URL || "";
const isPostgres = Boolean(DATABASE_URL);

const dataDir = path.join(__dirname, "data");
const dbPath = path.join(dataDir, "gabarito.db");

if (!isPostgres && !fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const sqliteDb = isPostgres ? null : new sqlite3.Database(dbPath);
const pgPool = isPostgres
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl: DATABASE_URL.includes("render.com") ? { rejectUnauthorized: false } : false
    })
  : null;

app.use(express.json({ limit: "2mb" }));

function normalizeQuery(query) {
  return isPostgres ? query : query.replace(/\$\d+/g, "?");
}

function run(query, params = []) {
  const normalizedQuery = normalizeQuery(query);
  if (isPostgres) {
    return pgPool.query(normalizedQuery, params);
  }

  return new Promise((resolve, reject) => {
    sqliteDb.run(normalizedQuery, params, function onRun(error) {
      if (error) {
        reject(error);
        return;
      }
      resolve(this);
    });
  });
}

function get(query, params = []) {
  const normalizedQuery = normalizeQuery(query);
  if (isPostgres) {
    return pgPool.query(normalizedQuery, params).then((result) => result.rows[0]);
  }

  return new Promise((resolve, reject) => {
    sqliteDb.get(normalizedQuery, params, (error, row) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(row);
    });
  });
}

function all(query, params = []) {
  const normalizedQuery = normalizeQuery(query);
  if (isPostgres) {
    return pgPool.query(normalizedQuery, params).then((result) => result.rows);
  }

  return new Promise((resolve, reject) => {
    sqliteDb.all(normalizedQuery, params, (error, rows) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(rows);
    });
  });
}

async function initDb() {
  if (isPostgres) {
    await run(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS exams (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        class_name TEXT NOT NULL,
        shift TEXT NOT NULL,
        subject TEXT NOT NULL,
        question_count INTEGER NOT NULL,
        choice_count INTEGER NOT NULL,
        official_answers TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS submissions (
        id SERIAL PRIMARY KEY,
        exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        student_name TEXT NOT NULL,
        class_name TEXT NOT NULL,
        shift TEXT NOT NULL,
        subject TEXT NOT NULL,
        student_answers TEXT NOT NULL,
        score INTEGER NOT NULL,
        total_questions INTEGER NOT NULL,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `);
    return;
  }

  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS exams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      class_name TEXT NOT NULL,
      shift TEXT NOT NULL,
      subject TEXT NOT NULL,
      question_count INTEGER NOT NULL,
      choice_count INTEGER NOT NULL,
      official_answers TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exam_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      student_name TEXT NOT NULL,
      class_name TEXT NOT NULL,
      shift TEXT NOT NULL,
      subject TEXT NOT NULL,
      student_answers TEXT NOT NULL,
      score INTEGER NOT NULL,
      total_questions INTEGER NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(exam_id) REFERENCES exams(id),
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `);
}

function authRequired(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (!token) {
    res.status(401).json({ error: "Acesso nao autorizado." });
    return;
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (error) {
    res.status(401).json({ error: "Sessao invalida ou expirada." });
  }
}

function sanitizeExam(row) {
  return {
    id: row.id,
    title: row.title,
    className: row.class_name,
    shift: row.shift,
    subject: row.subject,
    questionCount: row.question_count,
    choiceCount: row.choice_count,
    officialAnswers: JSON.parse(row.official_answers),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function sanitizeSubmission(row) {
  return {
    id: row.id,
    examId: row.exam_id,
    studentName: row.student_name,
    className: row.class_name,
    shift: row.shift,
    subject: row.subject,
    studentAnswers: JSON.parse(row.student_answers),
    score: row.score,
    totalQuestions: row.total_questions,
    createdAt: row.created_at
  };
}

app.post("/api/auth/register", async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) {
    res.status(400).json({ error: "Preencha nome, email e senha." });
    return;
  }

  try {
    const normalizedEmail = email.trim().toLowerCase();
    const existing = await get("SELECT id FROM users WHERE email = $1", [normalizedEmail]);
    if (existing) {
      res.status(409).json({ error: "Este email ja esta cadastrado." });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    let userId;

    if (isPostgres) {
      const created = await get(
        "INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id",
        [name.trim(), normalizedEmail, passwordHash]
      );
      userId = created.id;
    } else {
      const created = await run(
        "INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3)",
        [name.trim(), normalizedEmail, passwordHash]
      );
      userId = created.lastID;
    }

    const user = { id: userId, name: name.trim(), email: normalizedEmail };
    const token = jwt.sign(user, JWT_SECRET, { expiresIn: "7d" });
    res.status(201).json({ token, user });
  } catch (error) {
    res.status(500).json({ error: "Nao foi possivel criar a conta." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    res.status(400).json({ error: "Informe email e senha." });
    return;
  }

  try {
    const userRow = await get("SELECT * FROM users WHERE email = $1", [email.trim().toLowerCase()]);
    if (!userRow) {
      res.status(401).json({ error: "Credenciais invalidas." });
      return;
    }

    const ok = await bcrypt.compare(password, userRow.password_hash);
    if (!ok) {
      res.status(401).json({ error: "Credenciais invalidas." });
      return;
    }

    const user = { id: userRow.id, name: userRow.name, email: userRow.email };
    const token = jwt.sign(user, JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, user });
  } catch (error) {
    res.status(500).json({ error: "Nao foi possivel entrar." });
  }
});

app.get("/api/me", authRequired, async (req, res) => {
  res.json({ user: req.user });
});

app.get("/api/exams", authRequired, async (req, res) => {
  try {
    const rows = await all(
      "SELECT * FROM exams WHERE user_id = $1 ORDER BY updated_at DESC, id DESC",
      [req.user.id]
    );
    res.json({ exams: rows.map(sanitizeExam) });
  } catch (error) {
    res.status(500).json({ error: "Nao foi possivel listar os gabaritos." });
  }
});

app.get("/api/exams/:id", authRequired, async (req, res) => {
  try {
    const row = await get("SELECT * FROM exams WHERE id = $1 AND user_id = $2", [req.params.id, req.user.id]);
    if (!row) {
      res.status(404).json({ error: "Gabarito nao encontrado." });
      return;
    }
    res.json({ exam: sanitizeExam(row) });
  } catch (error) {
    res.status(500).json({ error: "Nao foi possivel carregar o gabarito." });
  }
});

app.post("/api/exams", authRequired, async (req, res) => {
  const { title, className, shift, subject, questionCount, choiceCount, officialAnswers } = req.body || {};

  if (!title || !className || !shift || !subject || !questionCount || !choiceCount || !Array.isArray(officialAnswers)) {
    res.status(400).json({ error: "Preencha todos os campos da prova." });
    return;
  }

  try {
    let row;

    if (isPostgres) {
      row = await get(
        `INSERT INTO exams (
          user_id, title, class_name, shift, subject, question_count, choice_count, official_answers
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *`,
        [
          req.user.id,
          title.trim(),
          className.trim(),
          shift.trim(),
          subject.trim(),
          Number(questionCount),
          Number(choiceCount),
          JSON.stringify(officialAnswers)
        ]
      );
    } else {
      const created = await run(
        `INSERT INTO exams (
          user_id, title, class_name, shift, subject, question_count, choice_count, official_answers
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          req.user.id,
          title.trim(),
          className.trim(),
          shift.trim(),
          subject.trim(),
          Number(questionCount),
          Number(choiceCount),
          JSON.stringify(officialAnswers)
        ]
      );
      row = await get("SELECT * FROM exams WHERE id = $1", [created.lastID]);
    }

    res.status(201).json({ exam: sanitizeExam(row) });
  } catch (error) {
    res.status(500).json({ error: "Nao foi possivel salvar o gabarito." });
  }
});

app.put("/api/exams/:id", authRequired, async (req, res) => {
  const { title, className, shift, subject, questionCount, choiceCount, officialAnswers } = req.body || {};

  if (!title || !className || !shift || !subject || !questionCount || !choiceCount || !Array.isArray(officialAnswers)) {
    res.status(400).json({ error: "Preencha todos os campos da prova." });
    return;
  }

  try {
    const existing = await get("SELECT id FROM exams WHERE id = $1 AND user_id = $2", [req.params.id, req.user.id]);
    if (!existing) {
      res.status(404).json({ error: "Gabarito nao encontrado." });
      return;
    }

    await run(
      `UPDATE exams
       SET title = $1, class_name = $2, shift = $3, subject = $4, question_count = $5, choice_count = $6,
           official_answers = $7, updated_at = CURRENT_TIMESTAMP
       WHERE id = $8 AND user_id = $9`,
      [
        title.trim(),
        className.trim(),
        shift.trim(),
        subject.trim(),
        Number(questionCount),
        Number(choiceCount),
        JSON.stringify(officialAnswers),
        req.params.id,
        req.user.id
      ]
    );

    const row = await get("SELECT * FROM exams WHERE id = $1 AND user_id = $2", [req.params.id, req.user.id]);
    res.json({ exam: sanitizeExam(row) });
  } catch (error) {
    res.status(500).json({ error: "Nao foi possivel atualizar o gabarito." });
  }
});

app.get("/api/submissions", authRequired, async (req, res) => {
  try {
    const params = [req.user.id];
    let query = "SELECT * FROM submissions WHERE user_id = $1";
    if (req.query.examId) {
      query += ` AND exam_id = $${params.length + 1}`;
      params.push(req.query.examId);
    }
    query += " ORDER BY created_at DESC, id DESC";

    const rows = await all(query, params);
    res.json({ submissions: rows.map(sanitizeSubmission) });
  } catch (error) {
    res.status(500).json({ error: "Nao foi possivel listar as correcoes." });
  }
});

app.post("/api/submissions", authRequired, async (req, res) => {
  const {
    examId,
    studentName,
    className,
    shift,
    subject,
    studentAnswers,
    score,
    totalQuestions
  } = req.body || {};

  if (!examId || !studentName || !className || !shift || !subject || !Array.isArray(studentAnswers)) {
    res.status(400).json({ error: "Preencha os dados do aluno e da correcao." });
    return;
  }

  try {
    const exam = await get("SELECT id FROM exams WHERE id = $1 AND user_id = $2", [examId, req.user.id]);
    if (!exam) {
      res.status(404).json({ error: "Gabarito vinculado nao encontrado." });
      return;
    }

    let row;

    if (isPostgres) {
      row = await get(
        `INSERT INTO submissions (
          exam_id, user_id, student_name, class_name, shift, subject, student_answers, score, total_questions
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *`,
        [
          Number(examId),
          req.user.id,
          studentName.trim(),
          className.trim(),
          shift.trim(),
          subject.trim(),
          JSON.stringify(studentAnswers),
          Number(score) || 0,
          Number(totalQuestions) || studentAnswers.length
        ]
      );
    } else {
      const created = await run(
        `INSERT INTO submissions (
          exam_id, user_id, student_name, class_name, shift, subject, student_answers, score, total_questions
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          Number(examId),
          req.user.id,
          studentName.trim(),
          className.trim(),
          shift.trim(),
          subject.trim(),
          JSON.stringify(studentAnswers),
          Number(score) || 0,
          Number(totalQuestions) || studentAnswers.length
        ]
      );
      row = await get("SELECT * FROM submissions WHERE id = $1", [created.lastID]);
    }

    res.status(201).json({ submission: sanitizeSubmission(row) });
  } catch (error) {
    res.status(500).json({ error: "Nao foi possivel salvar a correcao." });
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/app.js", (req, res) => {
  res.sendFile(path.join(__dirname, "app.js"));
});

app.get("/styles.css", (req, res) => {
  res.sendFile(path.join(__dirname, "styles.css"));
});

app.get("*", (req, res) => {
  res.redirect("/");
});

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Gerador de Gabarito online em http://localhost:${PORT}`);
      console.log(`Banco em uso: ${isPostgres ? "Postgres" : "SQLite"}`);
    });
  })
  .catch((error) => {
    console.error("Falha ao iniciar o banco de dados:", error);
    process.exit(1);
  });
