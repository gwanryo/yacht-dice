package hub

import (
	"fmt"
	"sync"

	"yacht-dice-server/message"
	"yacht-dice-server/player"
	"yacht-dice-server/room"
)

type Hub struct {
	mu      sync.RWMutex
	rooms   map[string]*room.Room
	players map[string]*player.Player
	roomOf  map[string]string
}

func New() *Hub {
	return &Hub{
		rooms:   make(map[string]*room.Room),
		players: make(map[string]*player.Player),
		roomOf:  make(map[string]string),
	}
}

func (h *Hub) RegisterPlayer(p *player.Player) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.players[p.ID] = p
}

func (h *Hub) GetPlayer(id string) *player.Player {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.players[id]
}

func (h *Hub) CreateRoom(password string) *room.Room {
	h.mu.Lock()
	defer h.mu.Unlock()
	code := room.GenerateCode()
	for h.rooms[code] != nil {
		code = room.GenerateCode()
	}
	r := room.New(code, password)
	h.rooms[code] = r
	return r
}

func (h *Hub) GetRoom(code string) *room.Room {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.rooms[code]
}

func (h *Hub) RemoveRoom(code string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.rooms, code)
	for pid, rc := range h.roomOf {
		if rc == code {
			delete(h.roomOf, pid)
		}
	}
}

func (h *Hub) JoinRoom(code string, p *player.Player) error {
	r := h.GetRoom(code)
	if r == nil {
		return fmt.Errorf(message.ErrRoomNotFound)
	}
	err := r.AddPlayer(p)
	if err != nil {
		return err
	}
	h.mu.Lock()
	h.roomOf[p.ID] = code
	h.mu.Unlock()
	return nil
}

func (h *Hub) LeaveRoom(playerID string) {
	h.mu.Lock()
	code, ok := h.roomOf[playerID]
	if ok {
		delete(h.roomOf, playerID)
	}
	h.mu.Unlock()
	if !ok {
		return
	}
	r := h.GetRoom(code)
	if r == nil {
		return
	}
	r.RemovePlayer(playerID, func() {
		h.RemoveRoom(code)
	})
}

func (h *Hub) PlayerRoom(playerID string) *room.Room {
	h.mu.RLock()
	defer h.mu.RUnlock()
	code := h.roomOf[playerID]
	return h.rooms[code]
}

func (h *Hub) ListRooms() []message.RoomListItem {
	h.mu.RLock()
	defer h.mu.RUnlock()
	list := make([]message.RoomListItem, 0, len(h.rooms))
	for _, r := range h.rooms {
		list = append(list, r.ListItem())
	}
	return list
}

func (h *Hub) RemovePlayerFull(playerID string) {
	h.LeaveRoom(playerID)
	h.mu.Lock()
	delete(h.players, playerID)
	h.mu.Unlock()
}
