var radius = 10;
var restitution = 0.5;
var mass = 1;
var kradius = 10;
var kradius2 = kradius * kradius;
var kradius3 =  kradius2 * kradius;
var kradius5 =  kradius3 * kradius2;
var targetDensity = 0.001;
var stiffness = 50000;
var viscocity = 100;

// let text = b64DecodeUnicode(window.location.search.substr(1) || "TFFZ");
let text = "LQY";

var particles = [];
var neighborIndices = [];

class Vector2{
    constructor(x, y) {
        this.x = x;
        this.y = y; 
    };
    len () { return Math.sqrt(this.x * this.x + this.y * this.y); };
    norm () { return this.mul(1/this.len()); };
    add (v) { return new Vector2(this.x + v.x, this.y + v.y); };
    sub (v) { return new Vector2(this.x - v.x, this.y - v.y); };
    mul (f) { return new Vector2(this.x * f, this.y * f); };
    div (f) { var invf = 1/f; return new Vector2(this.x * invf, this.y * invf); };
    dot (v) { return this.x * v.x + this.y * v.y; };
    refl (n) { return this.sub(n.mul(this.dot(n)));}
};
// Vector2.prototype = {
//     len : function() { return Math.sqrt(this.x * this.x + this.y * this.y); },
//     norm : function() { return this.mul(1/this.len()); },
//     add : function(v) { return new Vector2(this.x + v.x, this.y + v.y); },
//     sub : function(v) { return new Vector2(this.x - v.x, this.y - v.y); },
//     mul : function(f) { return new Vector2(this.x * f, this.y * f); },
//     div : function(f) { var invf = 1/f; return new Vector2(this.x * invf, this.y * invf); },
//     dot : function(v) { return this.x * v.x + this.y * v.y; },
//     refl : function(n) { return this.sub(n.mul(this.dot(n)));}
// };
Vector2.zero = new Vector2(0, 0);

var g = new Vector2(0, 100);

class Particle {
    constructor(position, velocity, text) {
        this.position = position;
        this.velocity = velocity;
        this.text = text;
        this.acceleration = Vector2.zero;
        this.density = Vector2.zero;
        this.pressure = 0;
    }
};

function b64EncodeUnicode(str) { return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, function toSolidBytes(match, p1) { return String.fromCharCode('0x' + p1); })); }
function b64DecodeUnicode(str) { return decodeURIComponent(atob(str).split('').map(function(c) {return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2); }).join('')); }

function init() {
    cellSize = kradius * 2;
    gridWidth = Math.floor((canvas.width + cellSize) / cellSize);
    gridHeight = Math.floor((canvas.height + cellSize) / cellSize);
    var size = gridWidth * gridHeight;
    grid = new Array(size);
    for (var i = 0; i < size; i++)
        grid[i] = [];
}

function kernel(r) {
    if (r > kradius)
        return 0;
    else {
        var x = 1 - r * r / kradius2;
        return 315 / (64 * Math.PI * kradius3) * x * x * x;
    }
}

function kernel_gradient(r, dir) {
    if (r > kradius)
        return 0;
    else {
        var x = 1.0 - r * r / kradius2;
        return dir.mul(945 / (32 * Math.PI * kradius5) * r * x * x);
    }
}

function kernel_laplacian(r) {
    if (r > kradius)
        return 0;
    else {
        var x = r * r / kradius2;
        return 945 / (32 * Math.PI * kradius5) * (1 - x) * (3 * x - 1);
    }
}

function computeCellIndex(i) {
    var p_i = particles[i];
    var x = Math.floor(p_i.position.x / cellSize);
    var y = Math.floor(p_i.position.y / cellSize);
    return y * gridWidth + x;
}

function updateGrid() {
    for (var i = 0; i < grid.length; i++)
        grid[i].length = 0;
    for (var i = 0; i < particles.length; i++)
        grid[computeCellIndex(i)].push(i);
}

function findNeighbors(i) {
    var p_i = particles[i];
    var x1 = Math.max(Math.floor((p_i.position.x - kradius) / cellSize), 0);
    var y1 = Math.max(Math.floor((p_i.position.y - kradius) / cellSize), 0);
    var x2 = Math.min(Math.floor((p_i.position.x + kradius) / cellSize), gridWidth - 1);
    var y2 = Math.min(Math.floor((p_i.position.y + kradius) / cellSize), gridHeight - 1);
    neighborIndices.length = 0;
    for (var y = y1; y <= y2; y++)
        for (var x = x1; x <= x2; x++) {
            var cell = grid[y * gridWidth + x];
            for (var j = 0; j < cell.length; j++)
                neighborIndices.push(cell[j]);
        }

    return neighborIndices;
}

function updateDensity(i, neighbors) {
    var p_i = particles[i];
    var sum = 0;
    for (var j = 0; j < neighbors.length; j++) {
        var p_j = particles[neighbors[j]];
        var r = p_j.position.sub(p_i.position).len();
        var W = kernel(r);
        if (W > 0)
            sum += mass * W;
    }
    p_i.density = sum;
}

function updatePressure(i) {
    var p_i = particles[i];
    p_i.pressure = stiffness * (p_i.density - targetDensity);
}

function accumulatePressureForce(i, neighbors) {
    var p_i = particles[i];
    for (var j = 0; j < neighbors.length; j++) {
        var p_j = particles[neighbors[j]];
        var dir = p_j.position.sub(p_i.position);
        var r = dir.len();
        if (r > 0 && r < kradius) {
            p_i.acceleration = p_i.acceleration.sub(
                kernel_gradient(r, dir.div(r)).mul(mass * (
                    p_i.pressure / (p_i.density * p_i.density)
                  + p_j.pressure / (p_j.density * p_j.density))));
        }
    }
}

function accumulateViscocityForce(i, neighbors) {
    var p_i = particles[i];
    for (var j = 0; j < neighbors.length; j++) {
        var p_j = particles[neighbors[j]];
        var dir = p_j.position.sub(p_i.position);
        var r = dir.len();
        if (r > 0 && r < kradius) {
            p_i.acceleration = p_i.acceleration.add(
                p_j.velocity.sub(p_i.velocity).div(p_j.density)
                    .mul(viscocity * mass * kernel_laplacian(r)));
        }
    }
}

function accumulateExternalForce(i) {
    var p_i = particles[i];
    p_i.acceleration = p_i.acceleration.add(g);
}

function integration(h) {
    for (var i = 0; i < particles.length; i++) {
        var p = particles[i];
        p.velocity = p.velocity.add(p.acceleration.mul(h));
        p.position = p.position.add(p.velocity.mul(h));
        p.acceleration = Vector2.zero;
    }
}

function heart(p) {
    var q = p.sub(new Vector2(256, 256)).mul(1/150);
    var xx = q.x * q.x, yy = q.y * q.y, a = xx + yy - 1;
    return a * a * a + xx * yy * q.y;
}

function grad(f, p) {
    return new Vector2(
        (f(new Vector2(p.x + 0.01, p.y)) - f(new Vector2(p.x - 0.01, p.y))) / 0.02,
        (f(new Vector2(p.x, p.y + 0.01)) - f(new Vector2(p.x, p.y - 0.01))) / 0.02);
}

function collision() {
    for (var i = 0; i < particles.length; i++) {
        var p = particles[i];
        if (heart(p.position) > 0)
            p.velocity = p.velocity.add(grad(heart, p.position).norm().mul(-50));
        p.position.x = Math.min(Math.max(p.position.x, radius), canvas.width - radius);
        p.position.y = Math.min(Math.max(p.position.y, radius), canvas.height - radius);
    }
}

function step(h) {
    updateGrid();

    for (var i = 0; i < particles.length; i++) {
        var neighbors = findNeighbors(i);
        updateDensity(i, neighbors);
        updatePressure(i);
    }

    for (var i = 0; i < particles.length; i++) {
        var neighbors = findNeighbors(i);
        accumulatePressureForce(i, neighbors);
        accumulateViscocityForce(i, neighbors);
        accumulateExternalForce(i);
    }

    integration(h);
    collision();
}

function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(255, 0, 0, 0.5)";
    for (var i = 0; i < particles.length; i++) {
        var p = particles[i];
        ctx.fillText(p.text, p.position.x, p.position.y);
    }
}

function playCotrol() {
    audio.addEventListener("loadeddata",
        function () {
        // audio.play();
        // start()
    });
        audio.addEventListener("play",
        function () {
        start()
    });
    // document.addEventListener("touchstart", //歌曲一经完整的加载完毕( 也可以写成上面提到的那些事件类型)
    //     function() {
    // alert("cc")
    //     .play();
    // })
}

function getSong() { 
    audio = document.getElementById("audio");
    audio.loop = true; //歌曲循环
    playCotrol(); //播放控制函数
    audio.src = "http://fs.w.kugou.com/201905200013/0938a311841bb55f992d205ff4cbe9b7/G126/M0A/06/07/HocBAFqWqw6AKxmcADX3sA0k39o695.mp3"
}

function start() {
    canvas = document.getElementById("canvas1");
    ctx = canvas.getContext("2d");
    init();
    var t = 0, p = 100, c = 0;
    var loop = function() {
        step(0.005);
        render();
        setTimeout(loop, 20);
        if (particles.length < 1314 && t % Math.floor(p) == 0) {
            particles.push(new Particle(new Vector2(canvas.width / 2, canvas.height / 5), new Vector2(Math.random() * 20 - 10, 0), text.charAt(c++ % text.length)));
            p = Math.max(p * 0.98, 1);
        }
        t++;
    }
    loop();
}
