(function($) {

	"use strict";

	var fullHeight = function() {

		$('.js-fullheight').css('height', $(window).height());
		$(window).resize(function(){
			$('.js-fullheight').css('height', $(window).height());
		});

	};
	fullHeight();

	

})(jQuery);

document.addEventListener('DOMContentLoaded', function () {
	const navLinks = document.querySelectorAll('#nav-links li a');

	navLinks.forEach(link => {
		link.addEventListener('click', function () {
			// Remove the active class from all list items
			navLinks.forEach(item => item.parentElement.classList.remove('active'));

			// Add the active class to the clicked list item
			this.parentElement.classList.add('active');
		});
	});

});




