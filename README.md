# "telegraph" [(working title)](https://www.youtube.com/watch?v=rXXM60niKbg)

This is a port of [GGPO](https://github.com/pond3r/ggpo/) to TypeScript. It's more or less a 1:1 copy of the original, for better or worse, but seems to work ok so far!

### Notable Changes

* Unlike GGPO, which creates UDP sockets for you, you have to bring your own [PeerJS](https://peerjs.com/) client that already has all players connected. This is in flux but I think will continue, since it's tricky to separate the idea of "game connection" from "lobby connection" with PeerJS, and adding in any kind of lobby management seems bad

* The runloop is... weird, since I tried to adapt C++ poll-based run loops to JS. There's no equivalent of `ggpo_idle`, so GGPO processing only happens during runloop ticks or in response to incoming messages. I think this makes sense, since you can't really busy-loop in a browser.

* Inputs are handled in a far more naive way, where we just send over all of the inputs for every frame instead of doing any kind of optimization for packet size/encoding speed. This could totally change in the future, but gives us flexibility for now

### Todo

- [ ] Allow any form of inputs instead of just keyCodes (arbitrary serializable object)
- [ ] Implement TimeSync/frame-advantage system
- [ ] Implement remaining events
- [ ] Implement network stats
- [ ] (near future) Implement debug backend (synctest)
- [ ] (far future) Implement spectators
- [ ] Figure out setFrameDelay usage in practice
