var model;
var handlers;
var p;
var starsJs;
var factionColors = [];
factionColors[0] = [0, 176 / 255, 255 / 255];
factionColors[1] = [145 / 255, 87 / 255, 199 / 255];
factionColors[2] = [244 / 255, 125 / 255, 31 / 255];
factionColors[3] = [236 / 255, 34 / 255, 35 / 255];
var regenerateCost = 10;

var emptyStarPrice = 10;
var occupiedStarPrice = 30;
var players = [];
var factions = [];

var logInStatus = 2;
/*
0 User id not in pastats
1 Waiting for sing up
2 Ok
 */
var statusMessage = [];
statusMessage[0] = "You can't sign in, your name isn't on PAstats";
statusMessage[1] = "Sign in successful, in a few hours your name should appear in the mercenaries board";
statusMessage[2] = "Online";

var url = "https://mingersinatiormingiedste:9f10cc3e4e71559e26a642d996c0238f80852b36@gmase.cloudant.com";

var turn;

var phases = [];
phases[0] = "Plan";
phases[1] = "Battle";

requireGW([
		'coui://ui/main/game/galactic_war/shared/js/vecmath.js'
	], function (
		VMath) {
	var exitGame = function () {
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
			var updateFilters = function () {
				var color = result.color();
				result.filters = [];
				if (color)
					result.filters.push(new createjs.ColorFilter(color[0], color[1], color[2], color.length >= 4 ? color[3] : 1));
			};
			updateFilters();
			result.color.subscribe(function () {
				updateFilters();
				result.updateCache();
			});
		}

		if (params.alpha !== undefined)
			result.alpha = params.alpha;

		if (!params.noCache) {
			// Note: Extra pixel compensates for bad filtering on the edges
			result.cache(-1, -1, params.size[0] + 2, params.size[1] + 2);
			$(result.image).load(function () {
				result.updateCache();
			});
		}
		return result;
	}

	function sortContainer(container) {
		container.sortChildren(function (a, b, options) {
			if (a.z === undefined) {
				if (b.z === undefined)
					return 0;
				return -1;
			} else if (b.z === undefined) {
				return 1;
			}
			return a.z - b.z;
		});
	}

	function SelectionViewModel(config) {
		var self = this;

		var galaxy = config.galaxy;
		var stars = config.stars;
		var hover = !!config.hover;
		var color = config.color;

		if (hover)
			iconUrl = 'coui://ui/main/game/galactic_war/shared/img/hover.png';
		else
			iconUrl = 'coui://ui/main/game/galactic_war/shared/img/selection.png';

		if (hover)
			color = [0.5, 0.9, 1];
		else
			color = [0, 0.8, 1];

		self.visible = ko.observable(true);
		self.star = ko.observable(-1);
		self.system = ko.computed(function () {
				return self.star() >= 0 ? galaxy.systems()[self.star()] : undefined;
			});

		var extractor = function (field) {
			return ko.pureComputed(function () {
				var system = self.system();
				if (system) {
					var ai = system.star.ai();
					return loc((ai && ai[field]) || system[field]() || '');
				} else {
					return '';
				}
			});
		};

		self.name = extractor('name');
		self.html = extractor('html');
		self.description = extractor('description');

		self.scale = new createjs.Container();
		self.scale.scaleY = 0.3;
		self.scale.scaleX = 0.4;
		self.scale.z = -1;
		self.icon = createBitmap({
				url: iconUrl,
				size: [240, 240],
				color: color
			});
		self.scale.addChild(self.icon);

		ko.computed(function () {
			var system = self.system();
			var visible = !!system && self.visible();
			if (hover && visible)
				visible = system.mouseOver() !== system.mouseOut();
			self.icon.visible = visible;
			if (self.icon.visible) {
				var container = system.systemDisplay;
				container.addChild(self.scale);
				sortContainer(container);
			} else {
				if (self.scale.parent)
					self.scale.parent.removeChild(self.scale);
			}
		});

		if (!hover) {
			self.icon.addEventListener('tick', function () {
				self.icon.rotation = (_.now() * 0.02) % 360;
			});

			self.system.subscribe(function (oldSystem) {
				if (oldSystem)
					oldSystem.selected(false);
			}, null, 'beforeChange');
			self.system.subscribe(function () {
				var newSystem = self.system();
				if (newSystem)
					newSystem.selected(true);
			});
		}
	}

	function GameViewModel(data) {
		var self = this;

		self.logInStatus = ko.observable(statusMessage[data.logInStatus]);
		self.alive = ko.observable(data.alive);
		self.money = ko.observable();
		self.turn = ko.observable(data.turn);
		self.phase = ko.observable(phases[data.phase]);
		self.regenerating = ko.observable(false);
		self.factionLeaders = ko.observableArray(data.factionLeaders);

		self.isFactionLeader = ko.observable(false);
		self.myFactionMoney = ko.observable();

		self.myFaction = ko.observable(-1);
		self.myFactionId = ko.observable(-1);
		self.attackCost = ko.observable(emptyStarPrice);

		self.myWinner = ko.observable("-1");
		self.myWinners = [];

		self.isDebugger = ko.computed(function () {
				if (cmdId = "U_MeI9Szu8BJHcWNR")
					return true;
				return false;
			}, this);

		self.resetLocalStorage = function () {
			localStorage.cmd_decalred_winners = "";
			localStorage.cmd_attacking = "";
			localStorage.cmd_money = null;
			localStorage.cmd_faction_money = null;
		}

		//localStorage.cmd_turn
		//localStorage.cmd_phase
		//localStorage.cmd_tick

		//localStorage.cmd_money Expires every tick
		//localStorage.cmd_regenerating
		//localStorage.cmd_attacking Expires if localStorage.cmd_phase changes
		//localStorage.cmd_declared_winners

		//Check changes
		var newTick = false;
		var newPhase = false;
		if (data.tick != localStorage.cmd_tick) {
			newTick = true;
		}
		if (newTick) {
			if (data.phase != localStorage.cmd_phase) {
				newPhase = true;
			}

		}

		//Applay changes
		if (newPhase) {
			localStorage.cmd_attacking = "";
			localStorage.cmd_decalred_winners = "";
		}

		if (newTick) {
			self.regenerating(false);
			localStorage.cmd_regenerating = false;
			self.money(parseInt(data.money));
		} else {
			if (localStorage.cmd_regenerating != "null")
				self.regenerating(localStorage.cmd_regenerating);
			if (localStorage.cmd_money != "null")
				self.money(parseInt(localStorage.cmd_money));
			else
				self.money(parseInt(data.money));
			if (localStorage.cmd_faction_money != "null")
				self.myFactionMoney(parseInt(localStorage.cmd_faction_money));
		}

		self.myFactionIndex = ko.computed(function () {
				for (var i = 0; i < self.factionLeaders().length; i++) {
					if (cmdId == self.factionLeaders()[i][0]) {
						self.myFaction(self.factionLeaders()[i][2]);
						self.myFactionId(self.factionLeaders()[i][4]);
						self.isFactionLeader(true);
						if (newTick || self.myFactionMoney() == null)
							self.myFactionMoney(self.factionLeaders()[i][3]);
						return i;
					}
				}
				return -1;
			}, this);

		//Save status in localStorage
		localStorage.cmd_tick = data.tick;
		localStorage.cmd_phase = data.phase;
		localStorage.cmd_money = self.money();
		localStorage.cmd_faction_money = self.myFactionMoney();

		if (localStorage.cmd_decalred_winners != null && localStorage.cmd_decalred_winners != "")
			self.myWinners = JSON.parse(localStorage.cmd_decalred_winners);

		self.declareWinner = function () {
			sendWinnerDeclaration(self.currentStarId(), self.myWinner(), cmdId, playerKey, self.turn());
			self.myWinners.push([self.currentStarId(), self.myWinner()]);
			localStorage.cmd_decalred_winners = JSON.stringify(self.myWinners);
			self.myWinner("-1");
		}

		self.attackingSystems = ko.observableArray();
		if (localStorage.cmd_attacking != null && localStorage.cmd_attacking.length > 0)
			self.attackingSystems(JSON.parse(localStorage.cmd_attacking));

		self.currentStar = ko.observable();

		self.showStarDialog = ko.computed(function () {
				if (self.currentStar() != null && data.stars[self.currentStar()].state == "available") {
					return true;
				}
				return false;
			}, this);

		self.currentStarName = ko.computed(function () {
				if (self.showStarDialog()) {
					return data.stars[self.currentStar()].name;
				}
				return "";

			}, this);

		self.currentStarAspirants = ko.computed(function () {
				if (self.showStarDialog()) {
					var output = [];
					var star = data.stars[self.currentStar()];
					var conflictNumber = star.attackers.length;
					if (star.owner != "-1")
						conflictNumber++;
					if (conflictNumber >= 2) {
						//Add attackers
						for (var i = 0; i < star.attackers.length; i++) {
							var faction = star.attackers[i];
							output.push(factions[parseInt(faction)]);
						}
						//Add owner
						if (star.owner != "-1") {
							output.push(factions[parseInt(star.owner)]);
						}
						return output;
					}
				}
				return null;

			}, this);

		self.currentStarMaxPlayers = ko.computed(function () {
				if (self.showStarDialog()) {
					return data.stars[self.currentStar()].max_players;
				}
				return "";

			}, this);

		self.currentStarWealth = ko.computed(function () {
				if (self.showStarDialog()) {
					return String(data.stars[self.currentStar()].wealth);
				}
				return "";

			}, this);

		self.currentStarOwner = ko.computed(function () {
				if (self.showStarDialog()) {
					return data.stars[self.currentStar()].owner;
				}
				return "-1";

			}, this);

		self.currentStarCost = ko.computed(function () {
				if (self.showStarDialog()) {
					if (data.stars[self.currentStar()].owner == self.myFactionId())
						return -1;
					if (data.stars[self.currentStar()].owner == -1)
						return emptyStarPrice;
				}
				return occupiedStarPrice;

			}, this);

		self.showStarCost = ko.computed(function () {
				return self.currentStarCost() != -1;
			}, this);

		self.currentStarId = ko.computed(function () {
				if (self.showStarDialog()) {
					return data.stars[self.currentStar()].id;
				}
				return -1;

			}, this);

		self.playerName = ko.observable(playerName);
		self.regenerateDialog = ko.observable(false);

		self.sendMoneyDialog = ko.observable(false);
		self.sendMoneyDialogFaction = ko.observable(false);

		self.intendedAmmount = ko.observable(0);
		self.transferTarget = ko.observable();
		self.targetId = null;

		self.transferTargetId = ko.observable();

		self.myFactionIcon = ko.computed(function () {
				if (self.myFactionIndex() != -1)
					return 'img/icon_faction_' + String(self.myFactionId()) + '.png';
				return 'img/icon_faction_0.png';
			}, this);

		self.systemFactionIcon = ko.computed(function () {
				if (self.currentStarOwner() != "-1")
					return 'img/icon_faction_' + self.currentStarOwner().toString() + '.png';
				return 'img/no_faction.png';
			}, this);

		self.nextPhase = ko.computed(function () {
				var next;
				if (data.phase == 0)
					next = "battle phase";
				else
					next = "next turn";
				return "till " + next;
			}, this);

		//End turn countdown
		var endDate = new Date(data.phaseEnds);

		var countdown = endDate - new Date().getTime();
		var countdownArray = new Array();

		var DAY = 24 * 60 * 60 * 1000;
		var HOUR = 60 * 60 * 1000;
		var MINUTE = 60 * 1000;
		var SECOND = 1000;

		countdownArray[0] = to_00_str(Math.floor(countdown / DAY));
		countdownArray[1] = to_00_str(Math.floor((countdown - countdownArray[0] * DAY) / HOUR));
		//countdownArray[2] = to_00_str(Math.floor((countdown - countdownArray[1] * HOUR - countdownArray[0] * DAY) / MINUTE));
		self.phaseCountDown = ko.observable(countdownArray[0] + "d " + countdownArray[1] + "h ");
		//self.phaseCountDown=self.turnCountDown;

		self.showRegenerateDialog = function () {
			self.regenerateDialog(true);
			self.intendedAmmount(regenerateCost);
		}
		self.hideRegenerateDialog = function () {
			self.regenerateDialog(false);
		}
		self.tryRegenerate = function () {
			//If player has regenerateCost he send order, else err messenge
			if (self.money() >= regenerateCost) {
				self.money(self.money() - regenerateCost);
				self.regenerating(true);
				localStorage.cmd_money = self.money();
				localStorage.cmd_regenerating = true;
				self.hideRegenerateDialog();
				//A special money transfer to regen comm
				sendMoney(regenerateCost, cmdId, cmdId, "REGENERATE", playerKey, self.turn());
			}
		}

		self.hasMoney = ko.computed(function () {
				return (parseInt(self.intendedAmmount()) > 0 && self.money() >= parseInt(self.intendedAmmount()) && self.intendedAmmount() % 1 == 0);
			}, this);

		self.canSend = ko.computed(function () {
				return (self.hasMoney() && self.transferTargetId() != null && self.transferTargetId() != cmdId);
			}, this);

		self.canSendFaction = ko.computed(function () {
				return (parseInt(self.intendedAmmount()) > 0 && self.myFactionMoney() >= parseInt(self.intendedAmmount()) && self.intendedAmmount() % 1 == 0 && self.transferTargetId() != null);
			}, this);

		//Attack dialog
		self.tryAttack = function () {
			sendAttackOrder(cmdId, self.myFactionId(), self.currentStarId(), playerKey, self.turn());
			//store attacking star;
			self.attackingSystems().push(self.currentStarId());
			localStorage.cmd_attacking = JSON.stringify(self.attackingSystems());
			self.myFactionMoney(self.myFactionMoney() - self.currentStarCost());
			localStorage.cmd_faction_money = self.myFactionMoney();
		}

		self.isAttacking = ko.computed(function () {
				for (var i = 0; i < self.attackingSystems().length; i++)
					if (self.attackingSystems()[i] == self.currentStarId()) {
						return true;
					}
				return false;
			}, this);

		self.canAttack = ko.computed(function () {
				//must be plan phase
				//must be faction leader
				//not already attacking the system
				var valAttacking = false;
				for (var i = 0; i < self.attackingSystems().length; i++)
					if (self.attackingSystems()[i] == self.currentStarId()) {
						valAttacking = true;
						break;
					}
				var valNotOwned = self.currentStarCost() != -1;

				var valPhase = self.phase() == "Plan";
				var valLeader = self.myFaction() != -1;

				//has money for it
				var valCost = self.currentStarCost() <= self.myFactionMoney();

				//is there a path if the star is occupied
				var valPath = false;
				if (self.currentStarCost() == occupiedStarPrice) { //TODO
					for (var p = 0; p < data.paths.length; p++) {
						var path = data.paths[p];
						if ((String(path[0]) == self.currentStarId() && data.stars[path[1]].owner == self.myFactionId()) || (String(path[1]) == self.currentStarId() && data.stars[path[0]].owner == self.myFactionId())) {
							valPath = true;
							break;
						}
					}
				} else
					valPath = true;

				return (valPhase && valLeader && !valAttacking && valCost && valNotOwned && valPath);
			}, this);

		self.canDeclareWinner = ko.computed(function () { //If player is faction leader, if phase=battle, his faction is an aspirant and havent declared winner yet
				var valLeader = self.myFaction() != -1;
				var valPhase = self.phase() == "Battle";
				var valAspirant = false;
				var aspirants = self.currentStarAspirants();
				if (aspirants != null)
					for (var i = 0; i < aspirants.length; i++) {
						if (self.myFactionId() == aspirants[i].id) {
							valAspirant = true;
							break;
						}
					}
				var valAlreadyDone = false;
				if (valLeader && valPhase && valAspirant)
					for (var i = 0; i < self.myWinners.length; i++)
						if (self.myWinners[i][0] == self.currentStarId()) {
							valAlreadyDone = true;
							break;
						}
				return valLeader && valPhase && valAspirant && !valAlreadyDone;
			}, this);

		self.winnerSelected = ko.computed(function () {
				return self.myWinner() != "-1";
			}, this);

		//Money transfer dialog
		self.showSendMoneyDialogFaction = function () {
			return self.showSendMoneyDialog(true);
		}
		self.showSendMoneyDialogPlayer = function () {
			return self.showSendMoneyDialog(false);
		}

		self.showSendMoneyDialog = function (faction) {
			self.intendedAmmount(5);
			var searchbox;
			if (faction) {
				self.sendMoneyDialogFaction(true);
				searchbox = $("#searchboxFaction");
			} else {
				self.sendMoneyDialog(true);
				searchbox = $("#searchbox");
			}
			var playerNames = []
			for (var i = 0; i < players.length; i++)
				playerNames.push(players[i].name);

			var autocomplete_options = {
				data: playerNames,
				list: {
					sort: {
						enabled: true
					},
					match: {
						enabled: true
					}
				}
			};
			//Autocomplete
			//self.complete = searchbox.easyAutocomplete(autocomplete_options);
			/* SETTING UP AUTOCOMPLETE */
			//var searchbox = $("#searchbox");
			var temp = searchbox.easyAutocomplete(autocomplete_options);

			searchbox.on('input change', function () {
				var found = false;
				if (self.transferTarget() != null) {
					var text = self.transferTarget();
					for (var x = 0; x < players.length; x++) {
						var player = players[x];
						if (player.name.toLowerCase() == text.toLowerCase()) {
							self.transferTargetId(player.id);
							found = true;
							break;
						}
					}
					if (!found)
						self.transferTargetId(null);
				}
			})

		}
		self.hideSendMoneyDialog = function () {
			self.sendMoneyDialogFaction(false);
			self.sendMoneyDialog(false);
		}
		self.trySendMoney = function () {
			self.sendMoneyDialog(false);
			self.money(self.money() - parseInt(self.intendedAmmount()))
			localStorage.cmd_money = self.money();
			sendMoney(parseInt(self.intendedAmmount()), cmdId, cmdId, self.transferTargetId(), playerKey, self.turn());
		}
		self.trySendMoneyFaction = function () {
			self.sendMoneyDialogFaction(false);
			self.myFactionMoney(self.myFactionMoney() - parseInt(self.intendedAmmount()))
			localStorage.cmd_faction_money = self.myFactionMoney();
			sendMoney(parseInt(self.intendedAmmount()), cmdId, self.myFactionId(), self.transferTargetId(), playerKey, self.turn());
		}

		self.useLocalServer = ko.observable().extend({
				session: 'use_local_server'
			});

		// Get session information about the user, his game, environment, and so on
		//self.uberId = ko.observable().extend({ session: 'uberId'});
		//self.displayName = ko.observable('').extend({ session: 'displayName' });


		// Tracked for knowing where we've been for pages that can be accessed in more than one way
		self.lastSceneUrl = ko.observable().extend({
				session: 'last_scene_url'
			});
		self.exitGate = ko.observable($.Deferred());
		self.exitGate().resolve();

		self.connectFailDestination = ko.observable().extend({
				session: 'connect_fail_destination'
			});
		self.connectFailDestination('');

		self.firstMousePosition = ko.observable(); // used for parallax
		var previousHeight = null

			self.resize = function () {
			self.galaxy.canvasSize([$("#galaxy-map").width(), $("#galaxy-map").height()]);
			previousHeight = $("#galaxy-map").height();
			self.firstMousePosition(null);
		}

		self.exitGame = exitGame;
		self.galaxy = new GalaxyViewModel(data);

		//TODO arreglar esto
		var defaultPlayerColor = [[210, 50, 44], [51, 151, 197]];
		var rawPlayerColor = defaultPlayerColor[0];
		var playerColor = _.map(rawPlayerColor, function (c) {
				return c / 255;
			});

		self.hidingUI = ko.computed(function () {
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
		self.start = function () {
			ko.observable().extend({
				session: 'has_entered_game'
			})(true);

			// Set up resize event for window so we can update the canvas resolution
			$(window).resize(self.resize);
			self.resize();

			//self.centerOnOrigin();

		};

		self.isUberBarVisible = ko.observable(false);
		var updateUberBarVisibility = function () {
			api.Panel.message('uberbar', 'visible', {
				'value': self.isUberBarVisible()
			});
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
		self.back = function () {
			model.lastSceneUrl('coui://ui/main/game/cmd/main.html');
			window.location.href = 'coui://ui/main/game/start/start.html';
			return; /* window.location.href will not stop execution. */
		};

		self.selection = new SelectionViewModel({
				galaxy: self.galaxy,
				hover: false
			});

		self.hoverSystem = new SelectionViewModel({
				galaxy: self.galaxy,
				hover: true
			});
		_.forEach(self.galaxy.systems(), function (system, star) {
			system.mouseOver.subscribe(function () {
				self.hoverSystem.star(star);
			});
		});
		_.forEach(self.galaxy.systems(), function (system, star) {
			system.click.subscribe(function () {
				self.selection.star(star);
				self.currentStar(star);
			});
		});
	}

	function GalaxyViewModel(data) {
		var self = this;

		self.systems = ko.observableArray();
		self.addSystem = function (star, index) {
			var result = new SystemViewModel({
					star: star,
					galaxy: self,
					stage: self.stage,
					index: index
				});
			self.systems.push(result);
			return result;
		}

		self.joinSystems = function (first, second) {
			if (first === second)
				return;
			self.systems()[first].connectTo(self.systems()[second], first < second);
			self.systems()[second].connectTo(self.systems()[first], second < first);
		}

		//self.radius = ko.observable(_.max(data.radius()));
		//var r= ko.observable([0.3,0.3]);
		//ko.computed(function() { return ko.observable([0.3,0.3]); });
		//self.radius = ko.observable(_.max(function() { return ko.observable([0.3,0.3]); }));

		self.radius = ko.observable(_.max([0.2, 0.2]));

		self.canvasSize = ko.observable([0, 0]);
		self.canvasWidth = ko.computed(function () {
				return self.canvasSize()[0];
			});
		self.canvasHeight = ko.computed(function () {
				return self.canvasSize()[1];
			});
		self.parallax = ko.observable([0, 0]);
		self.galaxyTransform = ko.computed(function () {
				var galaxyScale = self.radius() * 6;
				var size = _.map(self.canvasSize(), function (s) {
						return s * galaxyScale;
					});

				var parallaxAmount = 0.1;
				var parallax = _.map(self.parallax(), function (p) {
						return p * parallaxAmount;
					});

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
						0, 0, 0, 1);

				var tilt = 1;
				var tiltMatrix = VMath.m4(
						1, 0, 0, 0,
						0, 1, tilt, 0,
						0, 0, 1, 0,
						0, 0, 0, 1);

				var shrink = 0.5;
				var pinch = 0.25;
				var zScale = VMath.m4(
						1, 0, 0, 0,
						0, 1, 0, 0,
						0, 0, shrink, shrink + 1,
						0, 0, -pinch, 1);
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
						0, 0, 0, 1);
				var parallaxCanvas = VMath.m4_zero();
				VMath.concat_m4(parallaxMatrix, canvas, parallaxCanvas);

				var result = VMath.m4_identity();
				VMath.concat_m4(parallaxCanvas, worldViewProj, result);

				return result;
			});
		var applyTransform_temp_v = VMath.v4_zero();
		self.applyTransform = function (coordinates, result) {
			var canvasTransform = self.galaxyTransform();
			VMath.transform_m4_v3(canvasTransform, coordinates, applyTransform_temp_v);
			VMath.project_v4(applyTransform_temp_v, result);
		};

		self.stage = new createjs.Stage("galaxy-map");
		self.stage.enableMouseOver();

		var canvas = document.getElementById("galaxy-map");

		_.forEach(cmd_nebulae(), function (nebulaSettings) {
			var nebula = createBitmap(_.extend({
						nocache: true
					}, nebulaSettings));
			nebula.regX += nebulaSettings.offset[0];
			nebula.regY += nebulaSettings.offset[1];
			nebula.scaleX *= self.radius() * 6;
			nebula.scaleY *= self.radius() * 6;
			var nebulaCoords_v = VMath.v3(0, nebulaSettings.offset[2], 0);
			var nebulaPos_v = VMath.v3_zero();

			ko.computed(function () {
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
			if (Math.max(-1, Math.min(1, (e.wheelDelta || -e.detail))) > 0)
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
		ko.computed(function () {
			var zoom = self.zoom();
			var stage = self.stage;

			stage.scaleX = zoom;
			stage.scaleY = zoom;
		});

		self.stageOffset = ko.observable([0, 0]);
		$(canvas).mousedown(function (e) {
			e.preventDefault();
			var offset = {
				x: self.stage.x - e.pageX,
				y: self.stage.y - e.pageY
			};
			var moveStage = function (ev) {
				ev.preventDefault();
				self.stage.x = ev.pageX + offset.x;
				self.stage.y = ev.pageY + offset.y;
				self.stageOffset([self.stage.x, self.stage.y]);
			};
			$('body').mousemove(moveStage);
			var stopMoving = function () {
				$('body').off('mousemove', moveStage);
				$('body').off('mouseup', stopMoving);
			};
			$('body').mouseup(stopMoving);
		});

		_.forEach(data.stars, self.addSystem);
		for (var i = 0; i < data.paths.length; i++)
			self.joinSystems(data.paths[i][0], data.paths[i][1]);

		/*_.forEach(data.gates(), function(gate) {
		self.joinSystems(gate[0], gate[1]);
		});*/

		/*
		self.joinSystems(6, 7);
		self.joinSystems(7, 8);
		self.joinSystems(8, 9);
		self.joinSystems(8, 10);*/

		self.sortStage = function () {
			sortContainer(self.stage);
		};

		self.sortStage();

		self.scrollTo = function (coords) {
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
			var w = self.stage.canvas.width;
			var h = self.stage.canvas.height;
			if (w !== self.canvasWidth() ||
				h !== self.canvasHeight()) {
				self.canvasSize([w, h]);
			}
			self.stage.update();
			window.requestAnimationFrame(updateStage);
		};
		window.requestAnimationFrame(function () {
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
		self.attackers = star.attackers;

		self.visited = ko.computed(function () {
				return true
			});

		self.selected = ko.observable(false);

		var pos_v = VMath.v3_zero();
		var coordinates = VMath.copy(self.coordinates);
		self.pos = ko.computed(function () {
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
		ko.computed(function () {
			var p = self.pos();
			var scale = p[2];
			self.systemDisplay.scaleX = scale;
			self.systemDisplay.scaleY = scale;
		});

		self.origin = new createjs.Container();
		ko.computed(function () {
			var newPos = self.pos();
			self.origin.x = newPos[0];
			self.origin.y = newPos[1];
			self.origin.z = newPos[2];
		});
		stage.addChild(self.origin);

		self.origin.addChild(self.systemDisplay);

		self.connected = ko.computed(function () {
				return self.visited() || _.some(self.neighbors(), function (neighbor) {
					return neighbor.visited();
				});
			});

		self.connectTo = function (neighbor) {

			/*
			if (neighbor.index === self.index)
			return;

			if (_.some(self.neighbors(), function(n) { return n.index === neighbor.index; }))
			return;*/

			self.neighbors.push(neighbor);

			var shape = new createjs.Shape();
			ko.computed(function () {
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
			self.origin.addChildAt(shape, 0);
		}

		var ownerIcon = createBitmap({
				url: "img/owner.png",
				size: [240, 240],
				color: [1, 1, 1],
				scale: 0.7,
				alpha: 0.8
			});

		/*System owner*/
		//If no owner show star
		var owner = self.star.owner;

		var yOffset = 10;
		var playersHere = 0;

		if (owner == "-1" || !owner) {
			var icon = createBitmap({
					url: "img/star.png",
					size: [90, 90]
				});
			icon.z = 1;
			self.systemDisplay.addChild(icon);

		} else {

			var factionIcon = 'img/icon_faction_' + owner + '.png';
			var iconColor = factionColors[owner];
			playersHere++;

			self.icon = createBitmap({
					url: factionIcon,
					size: [128, 128],
					color: iconColor,
					scale: 0.4
				});
			self.icon.z = 0;
			self.systemDisplay.addChild(self.icon);
			yOffset = 30;
		}
		//Show attacking factions

		if (self.attackers != null) {
			var offset = 15;
			var xOffset = -1 * offset;
			for (var i = 0; i < self.attackers.length; i++) {
				playersHere++;
				var factionIcon = 'img/icon_faction_' + self.attackers[i] + '.png';
				var iconColor = factionColors[parseInt(self.attackers[i])];

				var icon = createBitmap({
						url: factionIcon,
						size: [128, 128],
						color: iconColor,
						scale: 0.22
					});
				icon.x = icon.x + xOffset;
				icon.y = icon.y + yOffset;
				icon.z = 1;
				self.systemDisplay.addChild(icon);
				xOffset = xOffset + 2 * offset;
			}
		}

		//Show battle Icon if there is a battle
		if (playersHere > 1) {
			var battleIcon = 'img/icons_command_attack_move.png';
			//var iconColor = factionColors[i];
			var icon = createBitmap({
					url: battleIcon,
					size: [60, 60],
					//color: iconColor,
					scale: 0.6
				});
			//icon.x=icon.x;
			icon.y = icon.y + 15;
			icon.z = 1;
			self.systemDisplay.addChild(icon);
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
		self.systemDisplay.addEventListener("click", function () {
			self.click(self.click() + 1);
		});
		//TODO

		self.mouseOver = ko.observable(0);
		self.mouseOut = ko.observable(0);
		self.systemDisplay.addEventListener('rollover', function () {
			self.mouseOver(self.mouseOver() + 1);
		});
		self.systemDisplay.addEventListener('rollout', function () {
			self.mouseOut(self.mouseOver());
		});
	}

	function mercsLeaderboards(data, ladder_name, title, playerId) {
		var self = this;
		self.data = data.players;
		self.data = self.data.sort(function (a, b) {
				return parseInt(b.wealth) - parseInt(a.wealth);
			});
		self.money = 0;
		self.aliveM = true;

		var tables_parent = $('<div></div>');
		tables_parent.attr('id', ladder_name);
		//tables_parent.attr('class', 'system-detail')

		var head = $('<div></div>');
		head.attr('class', 'div_credits_title')
		//head.attr('class', 'leaderboardTitle');
		head.html("Mercenaries - Tau & Status");
		tables_parent.append(head);

		var table = $("<ul></ul>");
		tables_parent.append(table);
		players = []

		for (var x = 0; x < self.data.length; x++) {
			var player = self.data[x];

			var row = $("<ul></ul>");
			var factionIcon = $("<img></img>");
			var rank = $("<li></li>");
			var name = $("<li></li>");
			var faction = $("<li></li>");
			var wealth = $("<li></li>");
			var score = $("<li></li>");
			var alive = $("<li></li>");
			if (player.id == playerId) {
				row.attr('id', 'current_player');
				self.money = player.wealth;
				self.aliveM = player.alive;
			}
			if (player.alive) {
				alive.css('color', "green");
				alive.html("&#10004");
			} else {
				alive.css('color', "red");
				alive.html("&#10008");
			}

			rank.attr('class', 'player_line');
			name.attr('class', 'player_line');
			wealth.attr('class', 'player_line');
			alive.attr('class', 'player_line');

			rank.html((parseInt(x) + 1).toString());
			name.html(player.name) //(parseInt(x) + 1).toString());
			faction.html(player.faction);
			wealth.html(player.wealth);
			score.html(player.score);

			if (player.faction != "") {
				factionIcon.attr('class', 'player_icon');
				factionIcon.attr('src', "img/colored_faction_" + player.faction + ".png");
				row.append(factionIcon);

			} else
				rank.attr('class', 'player_rank');

			row.append(rank);
			row.append(name);
			row.append(wealth);
			row.append(alive);
			//row.append(score);
			//row.attr('pid',player.Id);
			table.append(row);
			players.push(new Player(player.id, player.name, player.faction));
		};
		self.table = tables_parent;
		$('body').append(self.table);
		self.ready = true;
	}

	function Player(id, name, faction) {
		self = this;
		self.id = id;
		self.name = name;
		self.facion = faction;
	}

	function factionsLeaderboards(data, ladder_name, title) {
		var self = this;
		self.data = data.factions;
		factions = [];
		//We want to store the faction sorted by index not by wealth so we store them before sorting
		for (var x = 0; x < self.data.length; x++) {
			var faction = self.data[x];
			factions.push(new Faction(faction.faction_id, faction.name));
		}

		self.data = self.data.sort(function (a, b) {
				return ((parseInt(b.stars) * 100 + parseInt(b.wealth)) - (parseInt(a.stars) * 100 + parseInt(a.wealth)));
			});

		var tables_parent = $('<div></div>');
		tables_parent.attr('id', ladder_name);

		var head = $('<div></div>');
		head.attr('class', 'div_credits_title');
		head.html("Factions - Systems & Tau");
		tables_parent.append(head);

		var table = $("<ul></ul>");
		//table.attr('class','faction');
		tables_parent.append(table);
		self.factionLeaders = [];

		for (var x = 0; x < self.data.length; x++) {
			var faction = self.data[x];

			var row = $("<ul></ul>");
			var factionIcon = $("<img></img>");
			var rank = $("<li></li>");
			var name = $("<li></li>");
			var wealth = $("<li></li>");
			var leaders = $("<li></li>");
			var score = $("<li></li>");
			var stars = $("<li></li>");

			factionIcon.attr('class', 'faction_icon');
			factionIcon.attr('src', "img/colored_faction_" + faction.faction_id + ".png");
			factionIcon.attr('alt', "faction icon");

			rank.attr('class', 'faction_line');
			name.attr('class', 'faction_line');
			leaders.attr('class', 'faction_line');
			wealth.attr('class', 'faction_line');
			score.attr('class', 'faction_line');
			stars.attr('class', 'faction_line');

			rank.html((parseInt(x) + 1).toString());
			name.html(faction.name) //(parseInt(x) + 1).toString());
			var strLeaders = '';

			for (var i = 0; i < faction.leaders.length; i++) {
				strLeaders = strLeaders + faction.leaders[i] + "; ";
				self.factionLeaders.push([faction.leaders[i], x, faction.name, faction.wealth, faction.faction_id]);
			}

			strLeaders = strLeaders.slice(0, -2);
			leaders.html(strLeaders);
			wealth.html(faction.wealth);
			score.html(faction.score);
			stars.html(String(faction.stars));

			row.append(factionIcon);
			//row.append(rank);
			row.append(name);
			//row.append(leaders);
			row.append(stars);
			row.append(wealth);
			//row.append(score);
			table.append(row);

		};
		self.table = tables_parent;
		$('body').append(self.table);
		self.ready = true;
	}

	function Faction(id, name) {
		self = this;
		self.id = id;
		self.name = name;
	}

	function StarsData(data) {
		var self = this;
		self.stars = [];

		for (x in data.stars) {
			var star = data.stars[x];
			nStar = new CMDStar(star.x, star.y, star.z, star.owner, star.name, star.max_players, star.attackers, star.state, star.star_id, star.wealth);
			self.stars.push(nStar);
		};
	}
	function PathsData(data) {
		var self = this;
		self.paths = [];

		for (x in data.paths) {
			var path = data.paths[x];
			if (path.active) {
				nPath = [path.origin, path.destiny];
				self.paths.push(nPath);
			}
		};
	}

	function TurnData(data) {
		var self = this;
		self.turn = data.turn;
		self.phase = data.phase;
		self.tick = data.tick;
		self.turnEnds = data.turn_ends;
		self.phaseEnds = data.phase_ends;
	}

	function CMDGame(stars, paths, turn, alive, money, factionLeaders, logStatus) {
		var self = this;
		self.stars = stars;
		self.paths = paths;
		self.turn = turn.turn;
		self.phase = turn.phase;
		self.tick = turn.tick;
		self.turnEnds = turn.turnEnds;
		self.phaseEnds = turn.phaseEnds;
		self.alive = alive;
		self.money = money;
		self.factionLeaders = factionLeaders;
		self.logInStatus = logStatus;
	}

	function createUser(name, PID) {
		if (PID == null)
			cmdId = "U_" + makeKey();
		localStorage.cmd_playerId = cmdId;
		playerKey = localStorage.cmd_playerKey;
		if (localStorage.cmd_playerKey == null)
			playerKey = makeKey();
		//Sing up user with private key on remote DB
		//TODO: This is not a good way to verify identities but we will use it for now
		singUpUser(name, cmdId, playerKey);
		localStorage.cmd_playerKey = playerKey;
	}

	function makeKey() {
		var text = "";
		var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

		for (var i = 0; i < 15; i++)
			text += possible.charAt(Math.floor(Math.random() * possible.length));

		return text;
	}

	// Start loading the game & document
	var documentLoader = $(document).ready();
	//var infoLoaded=typeof starsJs != 'undefined';

	//The variables we get from these files
	var alive;
	var playerMoney;
	var factionLeaders = [];

	// Get session information about the user, his game, environment, and so on
	/*
	var uberIdIn = ko.observable().extend({
			session: 'uberId'
		});
	var oldId = "U_" + uberIdIn();
	*/

	var displayName = ko.observable('').extend({
			session: 'displayName'
		});

	//Ver en exodus o PAstats como guardar un dato en localStorage
	var playerName = decode(localStorage.uberName);
	var cmdId = localStorage.cmd_playerId;
	var playerKey = localStorage.cmd_playerKey;
	var playerId = -1;

	// We can start when both are ready
	$.when(
		$.get(url + "/cdm/stars", function (starsInput) {
			starsJs = new StarsData(starsInput);
		}, 'json'),
		$.get(url + "/cdm/paths", function (pathsInput) {
			pathsJs = new PathsData(pathsInput);
		}, 'json'),
		$.get(url + "/cdm/currentTurn", function (turnInput) {
			turn = new TurnData(turnInput);
		}, 'json'),
		//TODO when all players are registered propertly we won't need to call createUser always
		createUser(displayName(), cmdId),
		//logInStatus=1;

		documentLoader).then(function (
			$document) {

		$.when(
			$.get(url + "/cdm/players", function (players) {
				lb2 = new mercsLeaderboards(players, 'mercenaries-board', "Mercenaries", cmdId);
				playerMoney = lb2.money;
				alive = lb2.aliveM;

			}, 'json'),
			$.get(url + "/cdm/factions", function (factions) {
				lb = new factionsLeaderboards(factions, 'faction-board', "Factions");
				factionLeaders = lb.factionLeaders;
			}, 'json')).then(function ($document) {

			//var data = new CMDGame(starsJs.stars, pathsJs.paths, turn);
			var data = new CMDGame(starsJs.stars, pathsJs.paths, turn, alive, playerMoney, factionLeaders, logInStatus);
			model = new GameViewModel(data);

			$("body").mousemove(function (event) {
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

			handlers['settings.exit'] = function () {
				model.showSettings(false);
			};

			handlers['panel.invoke'] = function (params) {
				var fn = params[0];
				var args = params.slice(1);
				return model[fn] && model[fn].apply(model, args);
			};

			api.Panel.message('uberbar', 'visible', {
				'value': true
			});

			// setup send/recv messages and signals
			app.registerWithCoherent(model, handlers);

			// Activates knockout.js
			ko.applyBindings(model);

			model.start();
		});
	});

	function sendAttackOrder(player, subject, object, keyInput, turn) {
		var obj = {
			order: "attack",
			player: player,
			key: keyInput,
			subject: subject,
			object: object,
			time: new Date().getTime(),
			turn: turn
		};
		var postData = JSON.stringify(obj);

		$.ajax({
			headers: {
				'Accept': 'application/json',
				'Content-Type': 'application/json'
			},
			'type': 'POST',
			'url': url + "/cdm_private/",
			'data': postData
		});
	}

	function singUpUser(name, PID, keyInput) {
		var obj = {
			_id: PID,
			name: name,
			order: "newUser",
			key: keyInput,
			time: new Date().getTime()
		};

		var postData = JSON.stringify(obj);

		$.ajax({
			headers: {
				'Accept': 'application/json',
				'Content-Type': 'application/json'
			},
			'type': 'PUT',
			'url': url + "/cdm_private/" + PID,
			'data': postData
		});
	}

	function sendMoney(ammount, player, subject, object, keyInput, turn) {
		var obj = {
			order: "transfer",
			player: player,
			key: keyInput,
			subject: subject,
			object: object,
			ammount: ammount,
			time: new Date().getTime(),
			turn: turn
		};

		var postData = JSON.stringify(obj);

		$.ajax({
			headers: {
				'Accept': 'application/json',
				'Content-Type': 'application/json'
			},
			'type': 'POST',
			'url': url + "/cdm_private/",
			'data': postData
		});
	}

	function sendWinnerDeclaration(star, winner, player, keyInput, turn) {
		var obj = {
			order: "winner",
			player: player,
			key: keyInput,
			star: star,
			winner: winner,
			time: new Date().getTime(),
			turn: turn
		};

		var postData = JSON.stringify(obj);

		$.ajax({
			headers: {
				'Accept': 'application/json',
				'Content-Type': 'application/json'
			},
			'type': 'POST',
			'url': url + "/cdm_private/",
			'data': postData
		});
	}

});
