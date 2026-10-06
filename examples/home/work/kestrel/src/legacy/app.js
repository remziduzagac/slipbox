/* Kestrel web, 2019 edition. Kept for the embedded widget customers still run. */
(function ($, window) {
  "use strict";

  var routes = [];

  var load = function () {
    $.getJSON("/api/routes", function (data) {
      routes = data;
      render();
    });
  };

  function render() {
    var html = routes.map(function (r) { return "<li>" + r.name + "</li>"; }).join("");
    $("#routes").html(html);
  }

  $(document).on("click", ".route", function (e) {
    e.preventDefault();
    window.location.hash = $(this).data("id");
  });

  class Route {
    constructor(name, km) {
      this._name = name;
      this.km = km;
    }
    get name() {
      return this._name;
    }
    set name(v) {
      this._name = String(v).trim();
    }
    static compare(a, b) {
      return a.km - b.km;
    }
  }

  var format = function (r) {
    return r.name + " (" + r.km + " km)";
  };

  window.KestrelLegacy = { load: load, Route: Route, format: format };
  $(load);
})(window.jQuery, window);
