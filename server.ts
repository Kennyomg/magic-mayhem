import express from "express";
import expressWs from "express-ws";
import { ExpressPeerServer, type IClient } from "peer";
import { WebSocketServer } from 'ws';

const exWs = expressWs(express());
const app = exWs.app;

let shouldBroadcast = false;

let lobby: { peerId: string, client: WebSocket }[] = [];
function getClients(...peerIds: string[]) {
    return lobby.filter((client) => peerIds.includes(client.peerId)).map((client) => client.client);
}

let games: {
    hostPeerId: string, opponentPeerId?: string,
    data?: {
        summons: {
            type: string,
            x: number,
            y: number,
        }[], playerMana: number, opponentMana: number, gamePaused: boolean
    }
}[] = [];

// serve static files
app.use(express.static("public"));

app.ws("/ws", (ws: WebSocket, req) => {
    ws.on("message", (msg) => {
        const json = JSON.parse(String(msg));
        switch (json.type) {
            case "echo": {
                ws.send(JSON.stringify({ type: 'echo', data: json.data }));
                break;
            }
            case "join_lobby": {
                lobby.push({ peerId: json.data, client: ws });
                break;
            }
            case "create_game": {
                games.push({ hostPeerId: json.data });
                console.log("Game created", json.data, games);
                shouldBroadcast = true;
                break;
            }
            case "join_game": {
                if (
                    !(json.data.hostPeerId && json.data.opponentPeerId &&
                        typeof json.data.hostPeerId === "string" && typeof json.data.opponentPeerId === "string")
                ) {
                    console.error("Invalid join_game data", json.data);
                    return;
                }
                const [host, opponent] = getClients(json.data.hostPeerId, json.data.opponentPeerId);
                console.log("Join game", json.data.hostPeerId, json.data.opponentPeerId);
                if (!(host && opponent)) {
                    console.error(`Host or opponent not found: ${json.data.hostPeerId} ${json.data.opponentPeerId}`);
                    return;
                }
                const game = games.find((game) => game.hostPeerId === json.data.hostPeerId);
                if (!game) {
                    console.error(`Game not found: ${json.data.hostPeerId}`);
                    return;
                }
                console.log("Game joined", json.data, games.find((game) => game.hostPeerId === json.data.hostPeerId));
                game.opponentPeerId = json.data.opponentPeerId;
                host.send(JSON.stringify({ type: "game_joined", data: json.data.opponentPeerId }));
                opponent.send(JSON.stringify({ type: "game_joined", data: json.data.hostPeerId }));

                shouldBroadcast = true;
                break;
            }
            case "update_game": {
                const [opponent] = getClients(json.data.opponentPeerId);
                const gameToUpdate = games.find((game) => game.hostPeerId === json.data.hostPeerId && game.opponentPeerId === json.data.opponentPeerId);
                if (!opponent) {
                    console.error(`Host or opponent not found: ${json.data.hostPeerId} ${json.data.opponentPeerId}`);
                    ws.send(JSON.stringify({ type: "error", data: "Opponent not found" }));
                    if (gameToUpdate) {
                        games.filter((game) => !(game.hostPeerId === json.data.hostPeerId && game.opponentPeerId === json.data.opponentPeerId));
                    }
                    return;
                }
                if (!gameToUpdate) {
                    console.error(`Game not found: ${json.data.hostPeerId}`);
                    return;
                }
                opponent.send(JSON.stringify({ type: "game_updated", data: json.data.data }));
                break;
            }
            case "spawn": {
                console.log("Update game", json);
                const [host] = getClients(json.data.hostPeerId);
                if (!host) {
                    console.error(`Host not found: ${json.data.hostPeerId}`);
                    return;
                }
                host.send(JSON.stringify({ type: "spawn", data: json.data }));
                break;
            }
            case "delete_game": {
                const [opponent] = getClients(json.data.opponentPeerId);
                opponent?.send(JSON.stringify({ type: "game_deleted", data: json.data.hostPeerId }));
                games = games.filter((game) => game.hostPeerId !== json.data.hostPeerId && game.opponentPeerId !== json.data.opponentPeerId);
                shouldBroadcast = true;
                break;
            }
            case "game_over": {
                const [opponent] = getClients(json.data.opponentPeerId);
                if (!opponent) {
                    console.error(`Host or opponent not found: ${json.data.hostPeerId} ${json.data.opponentPeerId}`);
                    return;
                }
                const gameToUpdate = games.find((game) => game.hostPeerId === json.data.hostPeerId && game.opponentPeerId === json.data.opponentPeerId);
                if (!gameToUpdate) {
                    console.error(`Game not found: ${json.data.hostPeerId}`);
                    return;
                }
                opponent.send(JSON.stringify({ type: "game_over", data: json.data.data }));
                break;
            }
            default: {
                console.error(`Unknown message type: ${json.type}`, json);
                break;
            }
        }
    });
});

const wss: WebSocketServer = exWs.getWss();
wss.on("connection", (ws: WebSocket) => {
    ws.send(JSON.stringify({ type: "broadcast", data: games }));
    console.log("Client connected", wss.clients.size);
    // console.log("Client connected");
    // console.log(wss.clients.size);
});
wss.on("close", (ws: WebSocket) => {
    const player = lobby.find((player) => player.client === ws);
    console.log("Client disconnected", player?.peerId);
    if (!player) return console.error("Player not found when disconnecting", ws);

    lobby = lobby.filter((client) => client !== player);
    if (games.length) {
        games = games.filter((game) => game.hostPeerId !== player.peerId && game.opponentPeerId !== player.peerId);
    }
    shouldBroadcast = true;
});

setInterval(() => {
    if (!wss.clients.size) return games = [];
    if (!shouldBroadcast) return;
    console.log("Broadcasting", games);
    wss.clients.forEach((client) => {
        client.send(JSON.stringify({ type: "broadcast", data: games }));
    });
    shouldBroadcast = false;
}, 1000);

const server = app.listen(process.env.PORT || 3000, () => {
    console.log("Server started on http://localhost:" + (process.env.PORT || 3000));
});

const peerServer = ExpressPeerServer(server, {
    path: "/myapp"
});

app.use("/peerjs", peerServer);

peerServer.on("connection", (client) => {
    console.log("Peer Client connected", client.getId());
    games.push({
        hostPeerId: client.getId(),
    });
    shouldBroadcast = true;
});
peerServer.on("disconnect", (client) => {
    console.log("Client disconnected", client.getId());
    games = games.filter((game) => game.hostPeerId !== client.getId());
    shouldBroadcast = true;
});

