$(document).ready(function () {
	$('loc').each(function (index) {
		var name;
		name = "CMD";
		if ($(this).html() == "Settings") {
			$(this).parent().after('<div class="nav_item nav_item nav_item_text btn_std_ix" id = "cdm" onclick = "gotoCDM()"><loc>' + name + '</loc></div>')
		}
	})
})
function gotoCDM() {
	window.location.href = "coui://ui/main/game/cdm/main.html";
	return;
}
