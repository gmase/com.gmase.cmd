$(document).ready(function () {
    $( '#nav_quit' ).before( '<div id="nav_cmd" style="position:relative" class="nav_item nav_item_text btn_std_ix community-nav"  data-bind="click_sound: \'default\', rollover_sound: \'default\'" onclick = "gotoCMD()"><loc>CMD</loc></div>' );
	
})
function gotoCMD() {
	window.location.href = "coui://ui/main/game/cmd/main.html";
	return;
}



