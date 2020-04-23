# "telegraph" [(working title)](https://www.youtube.com/watch?v=rXXM60niKbg)

This is a port of [GGPO](https://github.com/pond3r/ggpo/) to TypeScript. It's more or less a 1:1 copy of the original, for better or worse, but seems to work ok so far!

### Notable Changes

* Unlike GGPO, which creates UDP sockets for you, you have to bring your own [PeerJS](https://peerjs.com/) client that already has all players connected. This is in flux but I think will continue, since it's tricky to separate the idea of "game connection" from "lobby connection" with PeerJS, and adding in any kind of lobby management seems bad

* The runloop is... weird, since I tried to adapt C++ poll-based run loops to JS. Events are processed during the runloop ticks to prevent introducing any subtle ordering bugs, but the internal runloop is only ticked once during the "idle" phase (and idle has been renamed to an `afterTick` hook to clarify usage). Incoming messages do cause an immediate out of band runloop tick which I hope will make up for the loss of idle.

* Inputs are handled in a far more naive way, where we just send over all of the inputs for every frame instead of doing any kind of optimization for packet size/encoding speed. This could totally change in the future, but gives us flexibility for now

### Todo

- [ ] Replace some UDP disconnect logic with PeerJS events
- [ ] Allow any form of inputs instead of just keyCodes (arbitrary serializable object)
- [ ] Implement TimeSync/frame-advantage system
- [ ] Implement network stats
- [ ] (near future) Implement debug backend (synctest)
- [ ] (far future) Implement spectators
- [x] Implement remaining events
- [x] Figure out setFrameDelay usage in practice
