// Supabase Configuration
const SUPABASE_URL = 'https://tizruuxytimqwiksyroc.supabase.co';
const SUPABASE_KEY = 'sb_publishable_F66Q9KEqDEQtIxPRSw3YDw_ndd66N6E';

// Initialize Supabase client
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// State Management
let squares = [];
const waitTime = 10 * 60 * 1000; // 10 mins

let userFingerprint = localStorage.getItem('genkou_fingerprint');
if (!userFingerprint) {
    userFingerprint = crypto.randomUUID();
    localStorage.setItem('genkou_fingerprint', userFingerprint);
}

let selectedCell = null;
let lastPostedTime = parseInt(localStorage.getItem('last_posted_time') || "0");

// DOM Elements
const gridOverlay = document.getElementById('grid-overlay');
const inputModal = document.getElementById('input-modal');
const charInput = document.getElementById('char-input');
const submitBtn = document.getElementById('submit-btn');
const cancelBtn = document.getElementById('cancel-btn');
const timerVal = document.getElementById('timer-val');
const cooldownMsg = document.getElementById('cooldown-timer');
const toast = document.getElementById('toast');

// Initialize Grid
function initGrid() {
    gridOverlay.innerHTML = '';
    for (let r = 0; r < 20; r++) {
        for (let c = 0; c < 21; c++) {
            const cell = document.createElement('div');
            cell.className = 'grid-cell';
            cell.dataset.row = r;
            cell.dataset.col = c;

            if (c === 10) {
                cell.classList.add('spine');
            } else {
                cell.addEventListener('click', () => handleCellClick(r, c));
            }
            gridOverlay.appendChild(cell);
        }
    }
}

// Fetch all squares from database
async function fetchSquares() {
    const { data, error } = await supabaseClient
        .from('squares')
        .select('*');

    if (error) {
        showToast('データの取得に失敗しました');
        return;
    }

    const previousIds = new Set(squares.map(s => s.id));
    squares = data;

    squares.forEach(sq => {
        renderSquare(sq, !previousIds.has(sq.id) && previousIds.size > 0);
    });
}

// Render a single square
function renderSquare(sq, isNew) {
    const cell = document.querySelector(`.grid-cell[data-row="${sq.row_idx}"][data-col="${sq.col_idx}"]`);
    if (cell && !cell.classList.contains('occupied')) {
        cell.classList.add('occupied');

        if (isNew) {
            cell.classList.add('just-added');
            setTimeout(() => cell.classList.remove('just-added'), 2000);
        }

        const charSpan = document.createElement('span');
        charSpan.className = 'char';
        charSpan.textContent = sq.character;
        cell.appendChild(charSpan);
    }
}

// Handle cell click
function handleCellClick(r, c) {
    const existing = squares.find(s => s.row_idx === r && s.col_idx === c);
    if (existing) return;

    const now = Date.now();
    const diff = now - lastPostedTime;

    if (diff < waitTime) {
        const remaining = waitTime - diff;
        showCooldown(remaining);
        return;
    }

    selectedCell = { r, c };
    inputModal.classList.remove('hidden');
    cooldownMsg.classList.add('hidden');
    charInput.value = '';
    charInput.focus();
    updateSubmitState();
}

charInput.addEventListener('input', () => {
    charInput.value = charInput.value.trim().substring(0, 1);
    updateSubmitState();
});

function updateSubmitState() {
    submitBtn.disabled = charInput.value.length === 0;
}

submitBtn.addEventListener('click', async () => {
    const char = charInput.value;
    if (!char || !selectedCell) return;

    submitBtn.disabled = true;
    submitBtn.textContent = '刻印中...';

    const { error } = await supabaseClient
        .from('squares')
        .insert([
            {
                row_idx: selectedCell.r,
                col_idx: selectedCell.c,
                character: char,
                user_fingerprint: userFingerprint
            }
        ]);

    if (error) {
        if (error.code === '23505') {
            showToast('このマスは既に使われています');
        } else if (error.message.includes('Rate limited')) {
            showToast('まだ呼吸を整える時間です（10分待ってください）');
        } else {
            showToast('エラーが発生しました: ' + error.message);
        }
        submitBtn.disabled = false;
        submitBtn.textContent = '刻む';
        return;
    }

    lastPostedTime = Date.now();
    localStorage.setItem('last_posted_time', lastPostedTime);

    inputModal.classList.add('hidden');
    submitBtn.textContent = '刻む';

    showToast('一文字、刻みました');
    fetchSquares();
});

cancelBtn.addEventListener('click', () => {
    inputModal.classList.add('hidden');
});

function showCooldown(ms) {
    cooldownMsg.classList.remove('hidden');
    inputModal.classList.remove('hidden');
    updateTimer(ms);
}

function updateTimer(ms) {
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    timerVal.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function showToast(msg) {
    toast.textContent = msg;
    toast.classList.remove('hidden');
    setTimeout(() => {
        toast.classList.add('hidden');
    }, 3000);
}

// Real-time updates
const channel = supabaseClient
    .channel('public:squares')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'squares' }, payload => {
        if (!squares.find(s => s.id === payload.new.id)) {
            squares.push(payload.new);
            renderSquare(payload.new, true);
        }
    })
    .subscribe();

// Start
initGrid();
fetchSquares();
setInterval(fetchSquares, 30000);
