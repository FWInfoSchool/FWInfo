const $ = id => document.getElementById(id);

let maps = {};
let roomData = {};
let records = [];
let selectedRoom = '';

async function init() {
  try {
    const response = await fetch('../data/ITInfo.json');
    const data = await response.json();

    maps = data.maps;
    roomData = data.roomData;
    records = data.records;

    // Set up shared campus aliases just like the original file
    roomData.BMA = roomData.IT;
    maps.BMA = maps.IT;
    maps['BMA-Aero'] = maps.Aero;
    maps['BMA-Bio'] = maps.Bio;

    setupEventListeners();
    checkUrlParams();
    updateUI();
  } catch (err) {
    console.error('Failed to load ITInfo.json:', err);
  }
}

function setupEventListeners() {
  $('school').addEventListener('change', updateUI);
  $('floor').addEventListener('change', updateUI);
  $('period').addEventListener('change', updateUI);

  $('searchBtn').addEventListener('click', runSearch);
  $('search').addEventListener('keyup', e => {
    if (e.key === 'Enter') runSearch();
    else renderRooms();
  });

  $('openRoom').addEventListener('click', () => {
    const code = $('roomCode').value.trim();
    if (code) {
      selectRoom(code);
      switchView('schedule');
    }
  });

  document.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      switchView(chip.dataset.view);
    });
  });
}

function switchView(view) {
  document.querySelectorAll('.chip').forEach(c => {
    c.classList.toggle('active', c.dataset.view === view);
  });
  $('roomsView').classList.toggle('hidden', view !== 'rooms');
  $('mapView').classList.toggle('hidden', view !== 'map');
  $('scheduleView').classList.toggle('hidden', view !== 'schedule');
  $('scanView').classList.toggle('hidden', view !== 'scan');
}

function updateUI() {
  const school = $('school').value;
  const floor = $('floor').value;

  // Update map image & title
  if (maps[school] && maps[school][floor]) {
    $('mapImage').src = maps[school][floor];
    $('mapTitle').textContent = `${school} — Floor ${floor} Map`;
  } else {
    $('mapImage').src = '';
    $('mapTitle').textContent = 'Floor map unavailable';
  }

  renderRooms();
  if (selectedRoom) selectRoom(selectedRoom);
}

function renderRooms() {
  const school = $('school').value;
  const floor = $('floor').value;
  const period = $('period').value;
  const query = $('search').value.trim().toLowerCase();

  const grid = $('roomGrid');
  grid.innerHTML = '';

  const floorRooms = (roomData[school] && roomData[school][floor]) || [];

  const filtered = floorRooms.filter(([roomName, roomType]) => {
    if (!query) return true;
    const roomRecords = records.filter(r => r.room.toLowerCase() === roomName.toLowerCase());
    const matchesRoom = roomName.toLowerCase().includes(query) || roomType.toLowerCase().includes(query);
    const matchesRecord = roomRecords.some(
      r => r.teacher.toLowerCase().includes(query) || r.subject.toLowerCase().includes(query)
    );
    return matchesRoom || matchesRecord;
  });

  if (filtered.length === 0) {
    grid.innerHTML = '<div class="muted">No rooms found on this floor matching your filter.</div>';
    return;
  }

  filtered.forEach(([roomName, roomType]) => {
    const activeRecord = records.find(
      r => r.room.toLowerCase() === roomName.toLowerCase() && r.period === period
    );

    const btn = document.createElement('button');
    btn.className = 'room';
    btn.innerHTML = `
      <strong>${roomName}</strong>
      <small>${activeRecord ? activeRecord.teacher : roomType}</small>
    `;
    btn.addEventListener('click', () => selectRoom(roomName));
    grid.appendChild(btn);
  });
}

function selectRoom(roomName) {
  selectedRoom = roomName;
  const period = $('period').value;

  // Find room metadata across all schools/floors
  let foundSchool = '';
  let foundFloor = '';
  let foundType = 'Room';

  for (const [sch, floors] of Object.entries(roomData)) {
    for (const [flr, list] of Object.entries(floors)) {
      const match = list.find(([rName]) => rName.toLowerCase() === roomName.toLowerCase());
      if (match) {
        foundSchool = sch;
        foundFloor = flr;
        foundType = match[1];
        break;
      }
    }
    if (foundSchool) break;
  }

  const roomRecords = records.filter(r => r.room.toLowerCase() === roomName.toLowerCase());
  const currentRecord = roomRecords.find(r => r.period === period);

  // Update Room Details panel
  $('detail').innerHTML = `
    <h3>${roomName} <span class="tag">${foundType}</span></h3>
    <p>${foundSchool ? `Campus: <strong>${foundSchool}</strong> · Floor <strong>${foundFloor}</strong>` : 'Custom / Office location'}</p>
    ${
      currentRecord
        ? `<p><strong>${period}:</strong> ${currentRecord.teacher}${currentRecord.subject ? ` — ${currentRecord.subject}` : ''}</p>`
        : `<p class="muted">No scheduled class listed for ${period}.</p>`
    }
  `;

  // Update Teacher / Classroom Schedule view
  $('roomInfo').innerHTML = `<strong>${roomName}</strong> (${foundType})`;
  const tbody = $('scheduleBody');
  tbody.innerHTML = '';

  if (roomRecords.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" class="muted">No teacher schedule records for this room.</td></tr>';
  } else {
    roomRecords.forEach(r => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><span class="tag">${r.period}</span></td>
        <td>${r.teacher}</td>
        <td>${r.subject || '<span class="muted">—</span>'}</td>
      `;
      tbody.appendChild(tr);
    });
  }
}

function runSearch() {
  const query = $('search').value.trim().toLowerCase();
  if (!query) {
    renderRooms();
    return;
  }

  // Check if search matches a room directly or a teacher/subject in records
  const matchedRecord = records.find(
    r =>
      r.room.toLowerCase() === query ||
      r.teacher.toLowerCase().includes(query) ||
      r.subject.toLowerCase().includes(query)
  );

  if (matchedRecord) {
    // Auto-switch school & floor to where that room lives
    for (const [sch, floors] of Object.entries(roomData)) {
      if (sch.startsWith('BMA')) continue;
      for (const [flr, list] of Object.entries(floors)) {
        if (list.some(([rName]) => rName.toLowerCase() === matchedRecord.room.toLowerCase())) {
          $('school').value = sch;
          $('floor').value = flr;
          updateUI();
          selectRoom(matchedRecord.room);
          switchView('schedule');
          return;
        }
      }
    }
    selectRoom(matchedRecord.room);
    switchView('schedule');
  } else {
    renderRooms();
  }
}

function checkUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const roomParam = params.get('room');
  if (roomParam) {
    selectRoom(roomParam);
    switchView('schedule');
  }
}

document.addEventListener('DOMContentLoaded', init);