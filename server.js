// server.js
import 'dotenv/config'; 
import express from "express";
import axios from "axios";
import cors from "cors";

const app = express();
// IMPORTANT: Your V3 Football API token must be in a .env file
const API_TOKEN = process.env.FOOTBALL_API_TOKEN; 
const BASE_URL = "https://api.sportmonks.com/v3/football";

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

// ===== In-memory caches for Football Data =====
let footballLiveScoresCache = [];
let footballTeamsCache = [];
let footballLeaguesCache = [];
let footballFixturesCache = []; // <-- 1. New cache for fixtures

// ===== Fetch Functions for Football =====

const fetchFootballLeagues = async () => {
  if (!API_TOKEN) return;
  try {
    const { data } = await axios.get(`${BASE_URL}/leagues`, {
      params: { api_token: API_TOKEN },
    });
    footballLeaguesCache = data.data.map((league) => ({
      id: league.id,
      name: league.name,
      image_path: league.image_path,
    }));
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
    footballTeamsCache = data.data.map((team) => ({
      id: team.id,
      name: team.name,
      image_path: team.image_path,
    }));
    console.log("Successfully fetched and cached football teams.");
  } catch (err) {
    console.error("Football Teams fetch error:", err.response?.data?.message || err.message);
  }
};

const fetchFootballLiveScores = async () => {
  if (!API_TOKEN) {
    console.warn("API token is not set. Skipping live score fetch.");
    return;
  }
  try {
    const { data } = await axios.get(`${BASE_URL}/livescores`, {
      params: {
        api_token: API_TOKEN,
        include: "scores;participants;state;league",
      },
    });
    footballLiveScoresCache = data.data || [];
    console.log(`Successfully fetched ${footballLiveScoresCache.length} live football matches.`);
  } catch (err) {
    console.error("Football LiveScores fetch error:", err.response?.data?.message || err.message);
  }
};

// --- 2. New function to fetch fixtures ---
const fetchFootballFixtures = async () => {
    if (!API_TOKEN) {
        console.warn("API token is not set. Skipping fixtures fetch.");
        return;
    }
    try {
        const { data } = await axios.get(`${BASE_URL}/fixtures`, {
            params: {
                api_token: API_TOKEN,
                include: "participants;league;round;state", // Include useful related data
            },
        });
        footballFixturesCache = data.data || [];
        console.log(`Successfully fetched ${footballFixturesCache.length} football fixtures.`);
    } catch (err) {
        console.error("Football Fixtures fetch error:", err.response?.data?.message || err.message);
    }
};


// ===== Initial Data Fetch =====
const initializeData = async () => {
  await fetchFootballLeagues();
  await fetchFootballTeams();
  await fetchFootballLiveScores();
  await fetchFootballFixtures(); // <-- Fetch fixtures on start
};

initializeData();

// ===== Intervals for Data Refreshing =====
setInterval(fetchFootballLiveScores, 15 * 1000); // Live scores every 15 seconds
setInterval(fetchFootballFixtures, 15 * 60 * 1000); // Fixtures every 15 minutes
setInterval(fetchFootballLeagues, 60 * 60 * 1000); // Static data every hour
setInterval(fetchFootballTeams, 60 * 60 * 1000);


// ===== Football API Routes =====
app.get("/api/football/livescores", (req, res) => {
    const shapedData = footballLiveScoresCache.map(match => {
        const localTeam = match.participants.find(p => p.meta.location === 'home');
        const visitorTeam = match.participants.find(p => p.meta.location === 'away');
        const localTeamScore = match.scores.find(s => s.participant_id === localTeam.id);
        const visitorTeamScore = match.scores.find(s => s.participant_id === visitorTeam.id);

        return {
            id: match.id,
            league_id: match.league_id,
            round: match.round?.name || 'N/A',
            localteam_id: localTeam.id,
            visitorteam_id: visitorTeam.id,
            starting_at: match.starting_at,
            status: match.state.state.toUpperCase(),
            minute: match.periods?.find(p => p.type === '2hg')?.minutes,
            live: match.state.state === 'live',
            scores: [
                { team_id: localTeam.id, score: localTeamScore?.goals || 0 },
                { team_id: visitorTeam.id, score: visitorTeamScore?.goals || 0 }
            ],
            // Pass the full objects for the card component to use
            participants: match.participants,
        };
    });
    res.json({ data: shapedData });
});

// --- 3. New route to serve fixtures ---
app.get("/api/football/fixtures", (req, res) => {
    const shapedData = footballFixturesCache.map(fixture => {
        const localTeam = fixture.participants.find(p => p.meta.location === 'home');
        const visitorTeam = fixture.participants.find(p => p.meta.location === 'away');
        return {
            id: fixture.id,
            league_id: fixture.league_id,
            round: fixture.round,
            starting_at: fixture.starting_at,
            status: fixture.state.state.toUpperCase(),
            live: false, // Fixtures are by definition not live
            participants: fixture.participants,
            // Add empty scores array for component consistency
            scores: [
                { participant_id: localTeam.id, goals: 0 },
                { participant_id: visitorTeam.id, goals: 0 }
            ]
        };
    });
    res.json({ data: shapedData });
});


app.get("/api/football/teams", (req, res) => res.json({ data: footballTeamsCache }));
app.get("/api/football/leagues", (req, res) => res.json({ data: footballLeaguesCache }));
app.get("/api/ping", (req, res) => res.status(200).send("pong"));

// ===== Start Server =====
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ Football server running on port ${PORT}`));