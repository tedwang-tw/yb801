var httpd = require('http').createServer(handler);
var io = require('socket.io').listen(httpd);
var fs = require('fs');
var child_process = require('child_process');
var count = 0;
var sno = 0;

httpd.listen(4000);
function handler(req, res) {
	fs.readFile(__dirname + '/index_demo.html',
		function (err, data) {
		if (err) {
			res.writeHead(500);
			return res.end('Error loading index.html');
		}
		res.writeHead(200);
		res.end(data);
	});
}

function run_cmd(broadcast, cmd) {
	var dataOut = '';

	function pumpData(data) {
		if (data.indexOf('\n') < 0)
			dataOut += data;
		else {
			broadcast.emit('serverMessage', dataOut);
			dataOut = '';
			broadcast.emit('serverMessage', data);
		}
	}

	//*
	var cmds = cmd.split(/\s/);
	var options = [];

	if (cmds.length > 1) {
		for (var i = 1; i < cmds.length; i++)
			options.push(cmds[i].trim());
	}
	var child = child_process.spawn(cmds[0].trim(), options);

	child.stdout.setEncoding('utf8');

	child.stdout.on('data', function (data) {
		//broadcast.emit('serverMessage', data);
		pumpData(data);
	});

	child.stderr.on('data', function (data) {
		broadcast.emit('serverMessage', data);
	});

	child.on('close', function (code) {
		//broadcast.emit('serverMessage', 'child process exited with code ' + code);
	});
	child.on('error', function (err) {
		broadcast.emit('serverMessage', 'child process exited with code ' + err);
	});

	//*/

	/*
	child_process.exec(cmd, {
	encoding : 'utf8'
	}, function (err, stdout, stderr) {
	// the command exited or the launching failed
	//console.log(stdout);
	if (err) {
	// we had an error launching the process
	broadcast.emit('serverMessage', stderr);
	} else {
	var lines = stdout.split('\n');
	//broadcast.emit('serverMessage', 'line# == ' + lines.length);
	//broadcast.emit('serverMessage', stdout);

	pumpData(stdout);
	return;
	}
	});
	//*/
}

io.sockets.on('connection', function (socket) {
	console.log("connection " + (++count));

	socket.on('clientMessage', function (content) {
		socket.emit('serverMessage', 'You said: ' + content);
		socket.get('username', function (err, username) {
			if (!username) {
				username = socket.id;
			}
			socket.get('room', function (err, room) {
				if (err) {
					throw err;
				}
				var broadcast = socket.broadcast;
				var message = content;
				socket.emit('serverMessage', 'You said: ' + content);
				if (room) {
					//broadcast.to(room);
					socket.broadcast.to(room).emit('serverMessage', '[' + room + '] ' + username + ' said: ' + message);
					run_cmd(broadcast, message);
				} else {
					//socket.emit('serverMessage', '[] No room to run command: ' + message);
					broadcast.emit('serverMessage', '[] No room to run command: ' + message);
				}
			});
		});

	});
	socket.on('login', function (username) {
		socket.set('username', username, function (err) {
			if (err) {
				throw err;
			}
			socket.emit('serverMessage', 'Currently logged in as ' + username);
			socket.broadcast.emit('serverMessage', 'User ' + username + ' logged in');
		});
	});
	socket.on('disconnect', function () {
		console.log("connection " + --count);

		socket.get('username', function (err, username) {
			if (!username) {
				username = socket.id;
			}
			socket.broadcast.emit('serverMessage', 'User ' + username + ' disconnected');
		});
	});
	socket.on('join', function (room) {
		socket.get('room', function (err, oldRoom) {
			if (err) {
				throw err;
			}
			if (room != oldRoom) {
				socket.set('room', room, function (err) {
					if (err) {
						throw err;
					}
					socket.get('username', function (err, username) {
						if (!username) {
							username = socket.id;
						}
						if (oldRoom) {
							socket.broadcast.to(oldRoom).emit('serverMessage', '[' + oldRoom + '] User ' + username + ' left this room');
							//console.log("Left room " + oldRoom);
							socket.leave(oldRoom);
						}
						socket.join(room);
						socket.emit('serverMessage', 'You joined room ' + room);
						socket.broadcast.to(room).emit('serverMessage', '[' + room + '] User ' + username + ' joined this room');
					});
				});
			} else {
				socket.emit('serverMessage', 'You already joined room ' + room);
				//console.log("Already joined " + room + " before!");
			}
		});
	});
	socket.on('leave', function (room) {
		socket.get('room', function (err, oldRoom) {
			if (err) {
				throw err;
			}
			if (oldRoom && (oldRoom == room || room == "*")) {
				//if (oldRoom && (oldRoom == room || room.trim() == "*")) {
				socket.get('username', function (err, username) {
					if (!username) {
						username = socket.id;
					}
					socket.emit('serverMessage', 'You are leaving room ' + oldRoom);
					socket.broadcast.to(oldRoom).emit('serverMessage', 'User ' + username + ' left this room');
					socket.set('room', '', function (err) { //	clear association
						if (err) {
							throw err;
						}
						socket.leave(oldRoom);
					});
				});
			} else {
				socket.emit('serverMessage', "You haven't joined room " + room);
			}
		});
	});
	socket.emit('login', ++sno);
});
