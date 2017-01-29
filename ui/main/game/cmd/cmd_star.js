    function CDMStar(x,y,z,owner) {
        var self = this;
        self.coordinates = [x,y,z];
        self.distance = ko.observable(0);
		self.name='TODO';
		self.visible = ko.observable(true);
		self.owner=owner;
    }

