const express = require('express');
const session = require('express-session');
const path = require('path');
const slugify = require('slugify');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { initDB, getAll, getOne, run } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.json({ limit: '50mb' }));

// Security: Helmet
app.use(helmet({
  contentSecurityPolicy: false, // Disabled to allow AOS and Quill inline styles/scripts
}));

// Security: CORS
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://brim.khatamunnabiyyin.com', 'http://brim.khatamunnabiyyin.com'] 
    : '*',
}));

// Security: Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // limit each IP to 200 requests per windowMs
});
app.use(limiter);

const loginLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // limit each IP to 10 login requests per windowMs
  message: 'Terlalu banyak percobaan login dari IP ini. Silakan coba lagi setelah satu jam.',
});

if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

app.use(session({
  secret: 'brim-kn-secret-key-super-secure',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 1000 * 60 * 60 * 24 // 1 day
  }
}));

// Auth Middleware
const requireAuth = (req, res, next) => {
  if (req.session.userId) {
    next();
  } else {
    res.redirect('/admin/login');
  }
};

// --- PUBLIC ROUTES ---

app.get('/', (req, res) => {
  const posts = getAll('SELECT * FROM posts ORDER BY created_at DESC LIMIT 3');
  res.render('index', { posts });
});

app.get('/blog', (req, res) => {
  const posts = getAll('SELECT * FROM posts ORDER BY created_at DESC');
  res.render('blog', { posts });
});

app.get('/blog/:slug', (req, res) => {
  const post = getOne('SELECT * FROM posts WHERE slug = ?', [req.params.slug]);
  if (!post) {
    return res.status(404).render('404');
  }
  res.render('post', { post });
});

// --- ADMIN ROUTES ---

app.get('/admin/login', (req, res) => {
  if (req.session.userId) return res.redirect('/admin');
  res.render('admin/login', { error: null });
});

app.post('/admin/login', loginLimiter, (req, res) => {
  const { username, password } = req.body;
  const user = getOne('SELECT * FROM users WHERE username = ?', [username]);
  
  if (user && bcrypt.compareSync(password, user.password)) {
    req.session.userId = user.id;
    res.redirect('/admin');
  } else {
    res.render('admin/login', { error: 'Invalid username or password' });
  }
});

app.get('/admin/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/admin/login');
});

app.get('/admin', requireAuth, (req, res) => {
  const posts = getAll('SELECT * FROM posts ORDER BY created_at DESC');
  res.render('admin/dashboard', { posts });
});

app.get('/admin/posts/new', requireAuth, (req, res) => {
  res.render('admin/edit', { post: null });
});

app.post('/admin/posts', requireAuth, (req, res) => {
  const { title, content, meta_description } = req.body;
  const slug = slugify(title, { lower: true, strict: true });
  
  try {
    run('INSERT INTO posts (title, slug, content, meta_description) VALUES (?, ?, ?, ?)', [title, slug, content, meta_description]);
    res.redirect('/admin');
  } catch (error) {
    res.status(400).send('Error creating post: ' + error.message);
  }
});

app.get('/admin/posts/:id/edit', requireAuth, (req, res) => {
  const post = getOne('SELECT * FROM posts WHERE id = ?', [req.params.id]);
  if (!post) return res.status(404).send('Post not found');
  res.render('admin/edit', { post });
});

app.post('/admin/posts/:id', requireAuth, (req, res) => {
  const { title, content, meta_description } = req.body;
  const slug = slugify(title, { lower: true, strict: true });
  
  try {
    run('UPDATE posts SET title = ?, slug = ?, content = ?, meta_description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [title, slug, content, meta_description, req.params.id]);
    res.redirect('/admin');
  } catch (error) {
    res.status(400).send('Error updating post: ' + error.message);
  }
});

app.post('/admin/posts/:id/delete', requireAuth, (req, res) => {
  run('DELETE FROM posts WHERE id = ?', [req.params.id]);
  res.redirect('/admin');
});

// Start Server
initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
