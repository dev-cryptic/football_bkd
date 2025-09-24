// server.js
import 'dotenv/config';
import express from "express";
import axios from "axios";
import cors from "cors";
import NodeCache from 'node-cache';

const app = express();
const API_TOKEN = process.env.FOOTBALL_API_TOKEN;
const BASE_URL = "https://api.sportmonks.com/v3/football";

// ====================================================================
// ===== 1. Initialize a single cache for the entire application =====
// stdTTL: Standard time-to-live in seconds for every new entry.
// checkperiod: How often the cache checks for expired keys.
// ====================================================================
const appCache = new NodeCache({ stdTTL: 60 * 15, checkperiod: 120 });

app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://atest.khelinfo.in",
      "https://khelinfo-frontend.vercel.app",
    ],
    methods: ["GET"],
  })
);
app.use(express.json());

// ===== Fetch Functions (now update the cache) =====

const fetchFootballLeagues = async () => {
  if (!API_TOKEN) return;
  try {
    const { data } = await axios.get(`${BASE_URL}/leagues`, {
      params: { api_token: API_TOKEN },
    });
    const leagues = data.data.map((league) => ({
      id: league.id,
      name: league.name,
      image_path: league.image_path,
    }));
    // Use appCache.set() instead of assigning to a variable
    appCache.set("leagues", leagues);
    console.log("Successfully fetched and cached football leagues.");
  } catch (err) {
    console.error("Football Leagues fetch error:", err.response?.data?.message || err.message);
  }
};

const fetchFootballTeams = async () => {
  if (!API_TOKEN) return;
  try {
    const { data } = await axios.get(`${BASE_URL}/teams`, {
      params: { api_token: API_TOKEN },
    });
    const teams = data.data.map((team) => ({
      id: team.id,
      name: team.name,
      image_path: team.image_path,
    }));
    appCache.set("teams", teams);
    console.log("Successfully fetched and cached football teams.");
  } catch (err) {
    console.error("Football Teams fetch error:", err.response?.data?.message || err.message);
  }
};

const fetchFootballLiveScores = async () => {
  if (!API_TOKEN) return;
  try {
    const { data } = await axios.get(`${BASE_URL}/livescores`, {
      params: {
        api_token: API_TOKEN,
        include: "scores;participants;state;league",
      },
    });
    appCache.set("liveScores", data.data || []);
    console.log(`Successfully fetched ${data.data?.length || 0} live football matches.`);
  } catch (err) {
    console.error("Football LiveScores fetch error:", err.response?.data?.message || err.message);
  }
};

const fetchFootballFixtures = async () => {
    if (!API_TOKEN) return;
    try {
        const { data } = await axios.get(`${BASE_URL}/fixtures`, {
            params: {
                api_token: API_TOKEN,
                include: "participants;league;round;state",
            },
        });
        appCache.set("fixtures", data.data || []);
        console.log(`Successfully fetched ${data.data?.length || 0} football fixtures.`);
    } catch (err) {
        console.error("Football Fixtures fetch error:", err.response?.data?.message || err.message);
    }
};

// ===== Initial Data Fetch & Intervals =====
const initializeData = async () => {
  await fetchFootballLeagues();
  await fetchFootballTeams();
  await fetchFootballLiveScores();
  await fetchFootballFixtures();
};

initializeData();

setInterval(fetchFootballLiveScores, 15 * 1000);
setInterval(fetchFootballFixtures, 15 * 60 * 1000);
setInterval(fetchFootballLeagues, 60 * 60 * 1000);
setInterval(fetchFootballTeams, 60 * 60 * 1000);


// ============================================================
// ===== 2. Update API Routes to read from the cache       =====
// Use appCache.get() and provide a default empty array ([])
// in case the cache is empty on a request.
// ============================================================
app.get("/api/football/livescores", (req, res) => {
    const liveScores = appCache.get("liveScores") || [];
    const shapedData = liveScores.map(match => {
        // ... (shaping logic is unchanged)
        const localTeam = match.participants.find(p => p.meta.location === 'home');
        const visitorTeam = match.participants.find(p => p.meta.location === 'away');
        const localTeamScore = match.scores.find(s => s.participant_id === localTeam.id);
        const visitorTeamScore = match.scores.find(s => s.participant_id === visitorTeam.id);
        return {
            id: match.id, league_id: match.league_id, round: match.round?.name || 'N/A',
            localteam_id: localTeam.id, visitorteam_id: visitorTeam.id, starting_at: match.starting_at,
            status: match.state.state.toUpperCase(), minute: match.periods?.find(p => p.type === '2hg')?.minutes,
            live: match.state.state === 'live',
            scores: [
                { team_id: localTeam.id, score: localTeamScore?.goals || 0 },
                { team_id: visitorTeam.id, score: visitorTeamScore?.goals || 0 }
            ],
            participants: match.participants,
        };
    });
    res.json({ data: shapedData });
});

app.get("/api/football/fixtures", (req, res) => {
    const fixtures = appCache.get("fixtures") || [];
    const shapedData = fixtures.map(fixture => {
        // ... (shaping logic is unchanged)
        const localTeam = fixture.participants.find(p => p.meta.location === 'home');
        const visitorTeam = fixture.participants.find(p => p.meta.location === 'away');
        return {
            id: fixture.id, league_id: fixture.league_id, round: fixture.round, starting_at: fixture.starting_at,
            status: fixture.state.state.toUpperCase(), live: false, participants: fixture.participants,
            scores: [
                { participant_id: localTeam.id, goals: 0 }, { participant_id: visitorTeam.id, goals: 0 }
            ]
        };
    });
    res.json({ data: shapedData });
});

app.get("/api/football/teams", (req, res) => res.json({ data: appCache.get("teams") || [] }));
app.get("/api/football/leagues", (req, res) => res.json({ data: appCache.get("leagues") || [] }));
app.get("/api/ping", (req, res) => res.status(200).send("pong"));

// ===== Start Server =====
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ Football server running on port ${PORT}`));