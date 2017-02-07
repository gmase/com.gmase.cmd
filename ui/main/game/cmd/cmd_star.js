    function CMDStar(x,y,z,owner,name,max_players,attackers,state,id,wealth) {
        var self = this;
        self.coordinates = [x,y,z];
        self.distance = ko.observable(0);
		self.name=name;
		self.max_players=max_players;
		self.attackers=attackers;
		self.visible = ko.observable(true);
		self.owner=owner;
		self.state=state;
		self.id=id;
		self.wealth=wealth;
    }
