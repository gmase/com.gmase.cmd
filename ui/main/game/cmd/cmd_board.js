var model;
var handlers;
var p;
var starsJs;
//var money =-1;
var factionColors=[];
factionColors[0]=[1,0,0];
factionColors[1]=[1,1,0];
factionColors[2]=[1,0,1];

requireGW([
    'coui://ui/main/game/galactic_war/shared/js/vecmath.js'
], function(
    VMath
) {
    var exitGame = function() {
        model.transitPrimaryMessage(loc('!LOC:Returning to Main Menu'));
        model.transitSecondaryMessage('');
        model.transitDestination('coui://ui/main/game/start/start.html');
        model.transitDelay(0);
        window.location.href = 'coui://ui/main/game/transit/transit.html';
        return; /* window.location.href will not stop execution. */
    };

    // Convenience function for setting up easeljs bitmaps
    // Parameters:
    //   url: image url (or image element).
    //   size: Array specifying image size. (length-2 array)
    //   scale: (optional) Uniform scale.
    //   color: (optional) Apply a color filter. (length-3 array, normalized color space)
    //   noCache: (optional) Don't apply caching.  (Incompatible with color.)
    function createBitmap(params) {
        if (!params.url)
            throw "No URL specified";
        if (!params.size)
            throw "No size specified";

        var result = new createjs.Bitmap(params.url);
        result.x = 0;
        result.y = 0;
        result.regX = params.size[0] / 2;
        result.regY = params.size[1] / 2;

        var scale = params.scale;
        if (scale !== undefined) {
            result.scaleX = scale;
            result.scaleY = scale;
        }

        var color = params.color;
        result.color = ko.observable();
        if (color) {
            if (params.noCache)
                throw "noCache incompatible with color";
            result.color(color);
            var updateFilters = function() {
                var color = result.color();
                result.filters = [];
                if (color)
                    result.filters.push(new createjs.ColorFilter(color[0],color[1],color[2],color.length >= 4 ? color[3] : 1));
            };
            updateFilters();
            result.color.subscribe(function() {
                updateFilters();
                result.updateCache();
            });
        }

        if (params.alpha !== undefined)
            result.alpha = params.alpha;

        if (!params.noCache) {
            // Note: Extra pixel compensates for bad filtering on the edges
            result.cache(-1,-1, params.size[0] + 2, params.size[1] + 2);
            $(result.image).load(function() { result.updateCache(); });
        }
        return result;
    }

    function sortContainer(container) {
        container.sortChildren(function(a, b, options) {
            if (a.z === undefined) {
                if (b.z === undefined)
                    return 0;
                return -1;
            }
            else if (b.z === undefined) {
                return 1;
            }
            return a.z - b.z;
        });
    }
     
	function GameViewModel(data) {
        var self = this;

        self.useLocalServer = ko.observable().extend({ session: 'use_local_server' });

        // Get session information about the user, his game, environment, and so on
        self.uberId = ko.observable().extend({ session: 'uberId' });

		
        // Tracked for knowing where we've been for pages that can be accessed in more than one way
        self.lastSceneUrl = ko.observable().extend({ session: 'last_scene_url' });
        self.exitGate = ko.observable($.Deferred());
        self.exitGate().resolve();

        self.connectFailDestination = ko.observable().extend({ session: 'connect_fail_destination' });
        self.connectFailDestination('');

        self.firstMousePosition = ko.observable(); // used for parallax
        var previousHeight = null

        self.resize = function() {
            self.galaxy.canvasSize([$("#galaxy-map").width(), $("#galaxy-map").height()]);
            previousHeight = $("#galaxy-map").height();
            self.firstMousePosition(null);
        }


        self.exitGame = exitGame;
        self.galaxy = new GalaxyViewModel(data);	

		
		//TODO arreglar esto
        var defaultPlayerColor = [ [210,50,44], [51,151,197] ];
        var rawPlayerColor = defaultPlayerColor[0];
        var playerColor = _.map(rawPlayerColor, function(c) { return c / 255; });
        //var playerStar = game.currentStar();
		var playerStar = new CMDStar();
        var stars=[playerStar]
		
		
        self.hidingUI = ko.computed(function() {
            return false;
        });
		//TODO
		/*
		self.centerOnOrigin = function () {
            var galaxy = game.galaxy();
            // center on the galaxy
            self.galaxy.scrollTo([0, 0, 0]);

            // offset to center in whitespace
            var height = $('#inventory').outerHeight();
            self.galaxy.scrollBy([0, height]);
        };*/

		self.driveAccessInProgress = ko.observable(false);
        self.start = function() {
            ko.observable().extend({ session: 'has_entered_game' })(true);

            // Set up resize event for window so we can update the canvas resolution
            $(window).resize(self.resize);
            self.resize();

            //self.centerOnOrigin();

        };

        self.isUberBarVisible = ko.observable(false);
        var updateUberBarVisibility = function () {
            api.Panel.message('uberbar', 'visible', { 'value': self.isUberBarVisible() });
        }
        self.isUberBarVisible.subscribe(updateUberBarVisibility);

        api.Panel.query(api.Panel.parentId, 'query.live_game_uberbar', {}).then(function (result) {
            self.isUberBarVisible(result);
        });

        self.toggleUberBar = function () {
            api.Panel.query(api.Panel.parentId, 'toggle_uberbar', {}).then(function (result) {
                self.isUberBarVisible(result);
            });
        };
		self.back = function() {
            model.lastSceneUrl('coui://ui/main/game/cmd/main.html');
            window.location.href = 'coui://ui/main/game/start/start.html';
            return; /* window.location.href will not stop execution. */
        };
        self.money=ko.observable(-3);
    }

    function GalaxyViewModel(data) {
        var self = this;
		
		self.systems = ko.observableArray();
        self.addSystem = function(star, index) {
            var result = new SystemViewModel({
                star: star,
				galaxy: self,
				stage: self.stage,
				index: index
            });
            self.systems.push(result);
            return result;
        }

		self.joinSystems = function(first, second) {
            if (first === second) return;
            self.systems()[first].connectTo(self.systems()[second], first < second);
            self.systems()[second].connectTo(self.systems()[first], second < first);
        }
		
		
		//self.radius = ko.observable(_.max(data.radius()));
		//var r= ko.observable([0.3,0.3]);
		//ko.computed(function() { return ko.observable([0.3,0.3]); });
		//self.radius = ko.observable(_.max(function() { return ko.observable([0.3,0.3]); }));
		
        self.radius = ko.observable(_.max([0.2,0.2]));

        self.canvasSize = ko.observable([0,0]);
        self.canvasWidth = ko.computed(function() { return self.canvasSize()[0]; });
        self.canvasHeight = ko.computed(function() { return self.canvasSize()[1]; });
        self.parallax = ko.observable([0,0]);
        self.galaxyTransform = ko.computed(function() {
            var galaxyScale = self.radius() * 6;
            var size = _.map(self.canvasSize(), function(s) { return s * galaxyScale; });

            var parallaxAmount = 0.1;
            var parallax = _.map(self.parallax(), function(p) { return p * parallaxAmount; });

            var aspectRatio = size[0] / size[1];
            aspectRatio /= 16 / 9; // Standard galaxy aspect ratio
            if (size[0] > size[1])
                size = [size[0] / aspectRatio, size[1]];
            else
                size = [size[0], size[1] * aspectRatio];

            var worldView = VMath.m4(
                1, 0, 0, 0,
                0, 0, 0, 0, // Flatten out Z
                0, 1, 0, 0,
                0, 0, 0, 1
            );

            var tilt = 1;
            var tiltMatrix = VMath.m4(
                1, 0, 0, 0,
                0, 1, tilt, 0,
                0, 0, 1, 0,
                0, 0, 0, 1
            );

            var shrink = 0.5;
            var pinch = 0.25;
            var zScale = VMath.m4(
                1, 0, 0, 0,
                0, 1, 0, 0,
                0, 0, shrink, shrink + 1,
                0, 0, -pinch, 1
            );
            var proj = VMath.m4_zero();

            VMath.concat_m4(zScale, tiltMatrix, proj);

            var worldViewProj = VMath.m4_zero();
            VMath.concat_m4(proj, worldView, worldViewProj);

            var scale = VMath.m4_scale4(size[0], size[1], 1, 1);
            var offset = VMath.m4_offset4(1.7, 1, 0, 1);
            var canvas = VMath.m4_zero();
            VMath.concat_m4(scale, offset, canvas);

            var parallaxMatrix = VMath.m4(
                1, 0, -parallax[0], 0,
                0, 1, -parallax[1], 0,
                0, 0, 1, 0,
                0, 0, 0, 1
            );
            var parallaxCanvas = VMath.m4_zero();
            VMath.concat_m4(parallaxMatrix, canvas, parallaxCanvas);

            var result = VMath.m4_identity();
            VMath.concat_m4(parallaxCanvas, worldViewProj, result);

            return result;
        });
        var applyTransform_temp_v = VMath.v4_zero();
        self.applyTransform = function(coordinates, result) {
            var canvasTransform = self.galaxyTransform();
            VMath.transform_m4_v3(canvasTransform, coordinates, applyTransform_temp_v);
            VMath.project_v4(applyTransform_temp_v, result);
        };

        self.stage = new createjs.Stage("galaxy-map");
        self.stage.enableMouseOver();

        var canvas = document.getElementById("galaxy-map");


        _.forEach(cmd_nebulae(), function(nebulaSettings) {
            var nebula = createBitmap(_.extend({ nocache: true }, nebulaSettings));
            nebula.regX += nebulaSettings.offset[0];
            nebula.regY += nebulaSettings.offset[1];
            nebula.scaleX *= self.radius() * 6;
            nebula.scaleY *= self.radius() * 6;
            var nebulaCoords_v = VMath.v3(0, nebulaSettings.offset[2], 0);
            var nebulaPos_v = VMath.v3_zero();

            ko.computed(function() {
                self.applyTransform(nebulaCoords_v, nebulaPos_v);
                nebula.x = nebulaPos_v[0];
                nebula.y = nebulaPos_v[1] - self.radius() * 2000;
                nebula.z = nebulaPos_v[2] - 2; // bias to make them render behind everything else
            });
            self.stage.addChild(nebula);
        });

        canvas.addEventListener("mousewheel", MouseWheelHandler, false);
        canvas.addEventListener("DOMMouseScroll", MouseWheelHandler, false);

        self.minZoom = ko.observable(0.2);
        self.maxZoom = ko.observable(0.7);

        self.zoom = ko.observable((function () {
            var minBaseline = 0.167;
            var maxBaseline = 0.275;
            var factor = (self.radius() - minBaseline) / (maxBaseline - minBaseline);


            var zoomForMin = 0.32;
            var zoomForMax = 0.2;
            var startingZoom = (zoomForMax * factor) + (zoomForMin * (1.0 - factor));
		
            return startingZoom;
        })());

        function MouseWheelHandler(e) {
            var zoomDelta;
            if(Math.max(-1, Math.min(1, (e.wheelDelta || -e.detail)))>0)
                zoomDelta = 1.1;
            else
                zoomDelta = 1 / 1.1;
            var stage = self.stage;
            var oldZoom = self.zoom();
            var newZoom = Math.max(self.minZoom(), Math.min(oldZoom * zoomDelta, self.maxZoom()));
            zoomDelta = newZoom / oldZoom;

            stage.x = stage.mouseX + (stage.x - stage.mouseX) * zoomDelta;
            stage.y = stage.mouseY + (stage.y - stage.mouseY) * zoomDelta;
            self.stageOffset([stage.x, stage.y]);
            self.zoom(newZoom);
        }
        ko.computed(function() {
            var zoom = self.zoom();
            var stage = self.stage;

            stage.scaleX = zoom;
            stage.scaleY = zoom;
        });

        self.stageOffset = ko.observable([0,0]);
        $(canvas).mousedown(function(e) {
            e.preventDefault();
            var offset = {
                x : self.stage.x - e.pageX,
                y : self.stage.y - e.pageY
            };
            var moveStage = function(ev) {
                ev.preventDefault();
                self.stage.x = ev.pageX+offset.x;
                self.stage.y = ev.pageY+offset.y;
                self.stageOffset([self.stage.x, self.stage.y]);
            };
            $('body').mousemove(moveStage);
            var stopMoving = function() {
                $('body').off('mousemove', moveStage);
                $('body').off('mouseup', stopMoving);
            };
            $('body').mouseup(stopMoving);
        });
		
		_.forEach(data.stars, self.addSystem);
		
		
		/*_.forEach(data.gates(), function(gate) {
            self.joinSystems(gate[0], gate[1]);
        });*/
		
		/*self.joinSystems(0, 1);
		self.joinSystems(1, 2);
		self.joinSystems(2, 3);
		self.joinSystems(3, 5);
		self.joinSystems(5, 4);
		self.joinSystems(4, 7);*/
		self.joinSystems(6, 7);
		self.joinSystems(7, 8);
		self.joinSystems(8, 9);
		self.joinSystems(8, 10);

		
        self.sortStage = function() {
            sortContainer(self.stage);
        };

        self.sortStage();

        self.scrollTo = function(coords) {
            var canvasPos = VMath.v3_zero();
            self.applyTransform(coords, canvasPos);
            self.stage.x = self.canvasSize()[0] / 2 - (canvasPos[0] * self.stage.scaleX);
            self.stage.y = self.canvasSize()[1] / 2 - (canvasPos[1] * self.stage.scaleY);
            self.stageOffset([self.stage.x, self.stage.y]);
        };

        self.scrollBy = function (delta) {
            var stage = self.stage;
            stage.x = stage.mouseX + (stage.x - delta[0]);
            stage.y = stage.mouseY + (stage.y - delta[1]);
            self.stageOffset([stage.x, stage.y]);
        }

        var updateStage = function () {
            if (model.hidingUI())
                return;
            var w = self.stage.canvas.width;
            var h = self.stage.canvas.height;
            if (w !== self.canvasWidth() ||
                h !== self.canvasHeight()) {
                self.canvasSize([w, h]);
            }
            self.stage.update();
            window.requestAnimationFrame(updateStage);
        };
        window.requestAnimationFrame(function() {
            self.sortStage();
            updateStage();
        });

        self.restartUpdateLoop = function () {
            updateStage();
        };
    }

	function SystemViewModel(init) {
        var self = this;

        var star = init.star;
        var stage = init.stage;
        var parent = init.galaxy;
        var index = init.index;

        // Initialize
        self.star = star;
        self.coordinates = star.coordinates;
        self.index = index;
        self.neighbors = ko.observableArray([]);
        //self.biome = star.biome;
        self.stage = stage;

		self.visited = ko.computed(function() {
            return true
        });
		
        self.selected = ko.observable(false);

        var pos_v = VMath.v3_zero();
        var coordinates = VMath.copy(self.coordinates);
        self.pos = ko.computed(function() {
            parent.applyTransform(coordinates, pos_v);
            return pos_v;
        });


		/*
        self.name = ko.computed(function() { return loc(star.system().display_name || star.system().name); });
        self.planets = ko.computed(function() { return star.system().planets; });
        self.description = ko.computed(function () {
            return loc(star.system().description);
        });
		
		
        self.html = ko.computed(function () {
            return loc(star.system().html);
        });*/

        // Set up display
        self.systemDisplay = new createjs.Container();
        ko.computed(function() {
            var p = self.pos();
            var scale = p[2];
            self.systemDisplay.scaleX = scale;
            self.systemDisplay.scaleY = scale;
        });

        self.origin = new createjs.Container();
        ko.computed(function() {
            var newPos = self.pos();
            self.origin.x = newPos[0];
            self.origin.y = newPos[1];
            self.origin.z = newPos[2];
        });
        stage.addChild(self.origin);

        self.origin.addChild(self.systemDisplay);

        self.connected = ko.computed(function() {
            return self.visited() || _.some(self.neighbors(), function(neighbor) { return neighbor.visited(); });
        });
		
        self.connectTo = function(neighbor) {
			
			/*
            if (neighbor.index === self.index)
                return;

            if (_.some(self.neighbors(), function(n) { return n.index === neighbor.index; }))
                return;*/

            self.neighbors.push(neighbor);

            var shape = new createjs.Shape();
            ko.computed(function() {
                var p = self.pos();
                var n = neighbor.pos();
                var graphics = shape.graphics;
                graphics.clear();

                var selected = self.selected() || neighbor.selected();
                var green = true;
                var lineColor = green ? 'rgba(64, 210, 64,0.8)' : 'rgba(255,215,120,0.8)';
                //if (selected && isolated)
				if (true)
                    lineColor = 'rgba(144,220,255,0.7)';
                graphics.ss(5).s(lineColor).moveTo(0, 0).lineTo((n[0] - p[0]) * 0.5, (n[1] - p[1]) * 0.5);
            });
            self.origin.addChildAt(shape,0);
        }

        var ownerIcon = createBitmap({
            url: "img/owner.png",
            size: [240, 240],
            color: [1,1,1],
            scale: 0.7,
            alpha: 0.8
        });
		
		
		/*System owner*/
		//If no owner show star
		var owner=self.star.owner
		
		if (owner==-1)
		{
			var icon = createBitmap({
				url: "img/star.png",
				size: [90,90]
			});
			icon.z = 1;
			self.systemDisplay.addChild(icon);
		}
		else{
		
			var factionIcon = 'img/icon_faction_' + owner.toString() + '.png';
			
			var iconColor=factionColors[owner];


			self.icon = createBitmap({
				url: factionIcon,
				size: [128,128],
				color: iconColor,
				scale: 0.4
			});
			self.icon.z = 0;
			
			/*
			self.iconScale = ko.observable(2);
			self.container = new createjs.Container();
			self.container.z = Infinity;
			self.container.scaleX = self.iconScale();
			self.container.scaleY = self.iconScale();

			self.offset = new createjs.Container();
			self.offset.x = 0.5;
			self.offset.y = 0.5;
			*/

			//self.container.addChild(self.offset);
			//self.offset.addChild(self.icon);
			self.systemDisplay.addChild(self.icon);
		}
		

		
		
		
        ownerIcon.visible = false;
        self.ownerColor = ko.observable();
        /*ko.computed(function() {
            ownerIcon.visible = (self.connected() && !!self.ownerColor()) || cheats.noFog();
            ownerIcon.color(self.ownerColor());
        });*/
		ownerIcon.visible = true;
		ownerIcon.color(self.ownerColor());
        var scaleOwner = new createjs.Container();
        //scaleOwner.addChild(ownerIcon);
        scaleOwner.z = 0;
        self.systemDisplay.addChild(scaleOwner);



        self.click = ko.observable(0);
        self.systemDisplay.addEventListener("click", function() { self.click(self.click() + 1); });

        self.mouseOver = ko.observable(0);
        self.mouseOut = ko.observable(0);
        self.systemDisplay.addEventListener('rollover', function() { self.mouseOver(self.mouseOver() + 1); });
        self.systemDisplay.addEventListener('rollout', function() { self.mouseOut(self.mouseOver()); });
    }

	
function CMDGame(stars, money) {
        var self = this;
        self.stars = stars;
		self.money= money;
		
    }
	
function mercsLeaderboards (data, ladder_name, title,playerId) {
	var that = this;
	this.data = data.players;
	/*this.data = this.data.sort(function (a, b) {
			return parseFloat(b.Rating) - parseFloat(a.Rating);
		});*/

	var tables_parent = $('<div></div>');
	tables_parent.attr('id', ladder_name);
	//tables_parent.attr('class', 'system-detail')
	
	var head = $('<div></div>');
	head.attr('id','div_credits_title')
	//head.attr('class', 'leaderboardTitle');
	head.html(title);
	tables_parent.append(head);
	
	var table = $("<table></table>");
	tables_parent.append(table);
	this.players = []

	for (x in this.data) {
		var player = this.data[x];
		var row = $("<tr></tr>");
		var rank = $("<th></th>");
		var name = $("<th></th>");
		var faction = $("<th></th>");
		var wealth = $("<th></th>");
		var score = $("<th></th>");
		player.elems = {
			row : row,
			name : name,
			faction : faction,
			wealth : wealth,
			score: score
		};
		if (player.uber_id==playerId)
		{
			row.attr('id','current_player');
			this.money=player.wealth;
		}
		
		if (player.alive)
			row.css('background-color', player.color);
		else
			row.css('background-color', 'rgba(200, 200, 200, 0.9)');
	
		
		/*name.attr('class', 'rank');
		faction.attr('class', 'user');
		wealth.attr('class', 'rating');
		score.attr('class', 'rating');*/
		rank.html((parseInt(x) + 1).toString());
		name.html(player.name)//(parseInt(x) + 1).toString());
		faction.html(player.faction);
		wealth.html(player.wealth);
		score.html(player.score);
		row.append(rank);
		row.append(name);
		row.append(faction);
		row.append(wealth);
		row.append(score);
		//row.attr('pid',player.Id);
		table.append(row);
		this.players.push(player.name);
	};
	this.table = tables_parent;
	$('body').append(this.table);
	this.ready = true;
}

function factionsLeaderboards (data, ladder_name, title) {
	var that = this;
	this.data = data.factions;
	/*this.data = this.data.sort(function (a, b) {
			return parseFloat(b.Rating) - parseFloat(a.Rating);
		});*/
		
	var tables_parent = $('<div></div>');
	tables_parent.attr('id', ladder_name);
	
	var head = $('<div></div>');
	head.attr('class', 'leaderboardTitle');
	head.html(title);
	tables_parent.append(head);
	
	var table = $("<table></table>");
	tables_parent.append(table);
	this.factions = []

	for (x in this.data) {
		var faction = this.data[x];
		var row = $("<tr></tr>");
		var rank = $("<th></th>");
		var name = $("<th></th>");
		var wealth = $("<th></th>");
		var leaders = $("<th></th>");
		var score = $("<th></th>");
		faction.elems = {
			row : row,
			name : name,
			leaders : leaders,
			wealth : wealth,
			score: score
		};		
		name.attr('class', 'rank');
		leaders.attr('class', 'user');
		wealth.attr('class', 'rating');
		score.attr('class', 'rating');
		rank.html((parseInt(x) + 1).toString());
		name.html(faction.name)//(parseInt(x) + 1).toString());
		
		var strLeaders=''
		for (lead in faction.leaders) {
			strLeaders=strLeaders+lead+"; ";
		}
		strLeaders=strLeaders.slice(0, -2);
		leaders.html(strLeaders);
		wealth.html(faction.wealth);
		score.html(faction.score);
		row.append(rank);
		row.append(name);
		row.append(leaders);
		row.append(wealth);
		row.append(score);
		table.append(row);
		this.factions.push(faction.name);
	};
	this.table = tables_parent;
	$('body').append(this.table);
	this.ready = true;
}

  function loadStars (data) {
	//this.data = data.stars;
	this.stars = []
		
	for (x in data.stars) {
		var star = data.stars[x];
		
		/*star.elems = {
			//star_Id : star_Id,
			x : x,
			y : y,
			z : z,
			state: state,
			owner: owner
		};*/
		nStar=new CMDStar(star.x,star.y,star.z,star.owner)
		this.stars.push(nStar);
	};
	this.stars;
}

    // Start loading the game & document
    var documentLoader = $(document).ready();
	//var infoLoaded=typeof starsJs != 'undefined';
	
	//TODO try get calls here
	var url="https://mingersinatiormingiedste:9f10cc3e4e71559e26a642d996c0238f80852b36@gmase.cloudant.com";
    
	/*var infoLoaded=function(){
			$.get(url + "/cmd/stars", function (stars) {
				starsJs=new loadStars(stars);
			}, 'json');
	};*/

			
//Ver en exodus o PAstats como guardar un dato en localStorage
var playerName=decode(localStorage.uberName);
var playerId=-1;


    // We can start when both are ready
    $.when(
		$.get(url + "/cdm/stars", function (stars) {
				starsJs=new loadStars(stars);
			}, 'json'),
        documentLoader
    ).then(function(
        $document
    ) {


	    var data= new CMDGame(starsJs.stars,money);
        model = new GameViewModel(data);


	//We won't use uberId because legal reasons? we'll use public PAstats id
//var playerId=api.net.uberId();
$.ajax({
	url : ('http://pastats.com/report/getplayerid?ubername=' + playerName),
	dataType : 'text',
	error : function () {
		alert("You must install and play with PAstats first");
	},
	success : function (PID) {
		playerId=PID;
		$.get(url + "/cdm/factions", function (factions) {
				lb=new factionsLeaderboards(factions,'faction-board',"Factions");
			}, 'json');
		$.get(url + "/cdm/players", function (players) {
				lb2=new mercsLeaderboards(players,'mercenaries-board',"Mercenaries",playerId);
				model.money=-20;
			}, 'json');
	}
});

	//sendOrders()

/*
    self.sendAuth = function( )
    {
        var client = self.client;

        self.socket.emit( 'auth', { uberId: self.uberId, uberName: self.uberName, uberToken: self.uberToken, displayName: self.displayName, client: client } );
    }
	*/



//$.post(url+ "/cmd/action",postData,'json');
  

		/*lb=new leaderboards("data",'faction-board',"nada");
		lb2=new leaderboards("data",'mercenaries-board',"nada");*/

        $("body").mousemove(function(event) {
            var halfWidth = window.innerWidth / 2;
            var halfHeight = window.innerHeight / 2;
            var pos = [event.pageX - halfWidth, event.pageY - halfHeight];
            if (!model.firstMousePosition()) {
                // Use the first mouse movement as an origin to avoid popping.
                model.firstMousePosition(pos)
                return;
            }
            VMath._sub_v2(pos, model.firstMousePosition());
            model.galaxy.parallax(pos);
            // Smoothly reset the center of parallax to the origin.
            VMath._mul_v2_s(model.firstMousePosition(), 0.9);
        });

        handlers = {};

        handlers['settings.exit'] = function() {
            model.showSettings(false);
        };

        handlers['panel.invoke'] = function(params) {
            var fn = params[0];
            var args = params.slice(1);
            return model[fn] && model[fn].apply(model, args);
        };
		
        api.Panel.message('uberbar', 'visible', { 'value': true });

        // setup send/recv messages and signals
        app.registerWithCoherent(model, handlers);

        // Activates knockout.js
        ko.applyBindings(model);

        model.start();
    });

	
	function sendOrders(){
		var obj = {
		_id: "gmase",
		order: "attack",
		obj:"32"
	};

	var postData = JSON.stringify(obj);

	$.ajax({
		headers: { 
			'Accept': 'application/json',
			'Content-Type': 'application/json' 
		},
		'type': 'PUT',
		'url': url+ "/cdm_private/action",
		'data': postData
		//'dataType': 'json'
		});
		}
	
	
});






