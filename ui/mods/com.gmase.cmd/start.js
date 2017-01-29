$(document).ready(function () {
	$('loc').each(function (index) {
		var name;
		name = "CMD";
		if ($(this).html() == "Settings") {
			$(this).parent().after('<div class="nav_item nav_item nav_item_text btn_std_ix" id = "cmd" onclick = "gotoCMD()"><loc>' + name + '</loc></div>')
		}
	})
})
function gotoCMD() {
	window.location.href = "coui://ui/main/game/cmd/main.html";
	return;
}
