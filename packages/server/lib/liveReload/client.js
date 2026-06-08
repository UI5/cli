(function() {
	// Path of the live reload WebSocket endpoint
	const WS_PATH = "/.ui5/liveReload/ws";
	// Periodic ping keeps traffic flowing on the WebSocket so that intermediate
	// proxies don't idle-close the connection.
	const PING_INTERVAL_MS = 30000;
	// Interval between reconnect probes after the server connection is lost.
	const RECONNECT_INTERVAL_MS = 1000;

	const proto = location.protocol === "https:" ? "wss:" : "ws:";
	const wsUrl = proto + "//" + location.host + WS_PATH;
	const pingMessage = JSON.stringify({type: "ping"});
	let willUnload = false;
	window.addEventListener("beforeunload", function() {
		willUnload = true;
	});

	const ws = new WebSocket(wsUrl);
	const pingInterval = setInterval(function() {
		if (ws.readyState === WebSocket.OPEN) {
			ws.send(pingMessage);
		}
	}, PING_INTERVAL_MS);
	ws.addEventListener("close", function() {
		clearInterval(pingInterval);
		if (willUnload) {
			return;
		}
		// Server connection lost: poll until it accepts WebSockets again, then reload.
		waitForServer().then(function() {
			location.reload();
		});
	});
	ws.addEventListener("message", function(e) {
		try {
			const msg = JSON.parse(e.data);
			if (msg.type === "reload") {
				location.reload();
			}
			// Ignore other message types (e.g. "ping" echo)
		} catch {
			// ignore malformed messages
		}
	});

	function probeServer() {
		return new Promise(function(resolve) {
			let probe;
			try {
				probe = new WebSocket(wsUrl);
			} catch {
				resolve(false);
				return;
			}
			function done(ok) {
				probe.removeEventListener("open", onOpen);
				probe.removeEventListener("error", onError);
				try {
					probe.close();
				} catch {
					// ignore
				}
				resolve(ok);
			}
			function onOpen() {
				done(true);
			}
			function onError() {
				done(false);
			}
			probe.addEventListener("open", onOpen);
			probe.addEventListener("error", onError);
		});
	}

	function wait(ms) {
		return new Promise(function(resolve) {
			setTimeout(resolve, ms);
		});
	}

	function waitVisible() {
		return new Promise(function(resolve) {
			function onChange() {
				if (document.visibilityState === "visible") {
					document.removeEventListener("visibilitychange", onChange);
					resolve();
				}
			}
			document.addEventListener("visibilitychange", onChange);
		});
	}

	function waitForServer() {
		function loop() {
			if (document.visibilityState !== "visible") {
				return waitVisible().then(loop);
			}
			return probeServer().then(function(ok) {
				if (ok) {
					return;
				}
				return wait(RECONNECT_INTERVAL_MS).then(loop);
			});
		}
		return loop();
	}
})();
