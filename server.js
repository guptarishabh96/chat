var express = require('express');
var app = express();
var server = require('http').createServer(app);
var io = require('socket.io').listen(server);
var mongoose = require('mongoose');
var hash = require('password-hash');
var session = require('express-session');

app.use(session({secret:"rishabh", resave:false, saveUninitialized:true}));

var users = {};

server.listen(3000);
console.log('Server running...');

var db = mongoose.createConnection('mongodb://localhost/chat',function(err){
    if(err){
        console.log(err);
    } else{
        console.log('Connected to chat db!');
    }
});
var db2 = db.useDb('user');

var chatSchema = mongoose.Schema({
    nick: String,
    msg: String,
    created: {type: Date, default: Date.now}
});

var userSchema = mongoose.Schema({
    nick: String,
    pass: String
});

var Chat = db.model('Message', chatSchema);
var User = db2.model('User', userSchema);


app.get('/',function(req, res){
    res.sendFile(__dirname+'/index.html');
});

io.sockets.on('connection', function(socket){
    
    var query = Chat.find({});
    query.sort('-created').limit(8).exec(function(err, docs){
        if(err) throw err;
        socket.emit('load old msgs',docs);
    });
    
    socket.on('new user', function(data, pass, callback) {
        var hashedPass = hash.generate(pass);
        var query = User.findOne({nick: data}).select('nick pass');
        if(data.trim()===''||pass.trim()==='')
            callback(false);
        else {   
            query.exec(function(err, user){
                if(err) throw err;
                if(user) {
                    if(hash.verify(pass, user.pass)) {
                        callback(true);
                        socket.nickname = user.nick;
                        users[socket.nickname] = socket;
                        updateNicknames();    
                    } else{
                        callback(false);
                    }
                } else{
                        callback(true);
                        socket.nickname = data;
                        users[socket.nickname] = socket;
                        updateNicknames();
                        var newUser = new User({nick: socket.nickname, pass: hashedPass});
                        newUser.save(function(err2){
                            if(err2) throw err2; 
                            console.log('New User Added: ' + socket.nickname);
                        });  
                }
                });
        }
    });
    
    function updateNicknames() {
        io.sockets.emit('usernames', Object.keys(users));
    }
    
    socket.on('send message', function(data, callback){
       var msg = data.trim();
        if(msg.substr(0,3) === '/w ') {
            msg = msg.substr(3);
            var ind = msg.indexOf(' ');
            if(ind!==-1){
                var name=msg.substr(0,ind);
                var msg=msg.substr(ind+1);
                if(name in users){
                    users[name].emit('whisper', {msg:msg, nick:socket.nickname});
                    console.log('Whisper:');
                } else{
                    callback('Error: Please enter a valid user.');
                }
            } else{
                callback('Error: Please enter a message for your whisper.');
            }
        } else{
            var newMsg = new Chat({msg: msg, nick:socket.nickname});
            newMsg.save(function(err){
                if(err) throw err;
                io.sockets.emit('new message', {msg:msg, nick:socket.nickname});  
            });  
        }
    });
    
    socket.on('disconnect', function(data) {
        if(!socket.nickname) return;
        delete users[socket.nickname];
        updateNicknames();
    });
    
});