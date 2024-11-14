const ctx = {
    REFERENCE_YEAR: "2010", // year used as a reference, between 1948 and 2021
    w: 1200,
    h: 1400,
    carte_w: 600,
    carte_h: 800,
    timeline_w: 600,
    timeline_h: 700,
    details_w: 600,
    details_h: 700,
    GREY_NULL: "#333",
    STAGE_DURATION: 1000,
    DOUBLE_CLICK_THRESHOLD: 320,
    totalStripPlotHeight: 420,
    totalLinePlotHeight: 900,
    vmargin: 2,
    hmargin: 4,
    timeParser: d3.timeParse("%Y-%m-%d"),
    yearAxisHeight: 20,
    linePlot: false,
    crossSeriesTempExtent: [0, 0],
    // test
};

// The column names of CITY_NAMES to be exctracted from the dataset
const CITY_NAMES = ["boston", "new_york", "los_angeles", "anchorage", "dallas", "miami", "honolulu", "las_vegas", "phoenix", "new_orleans", "san_francisco", "seattle", "sacramento", "reno", "portland", "oklahoma_city", "memphis", "minneapolis", "kansas_city", "detroit", "denver", "albuquerque", "atlanta"];

function transformData(data) {
    let temperatureSeries = { dates: [], series: [] };
    ctx.cityRefTemps = {};
    let cityDeltaTemps = {};
    CITY_NAMES.forEach(
        function (c) {
            ctx.cityRefTemps[c] = [];
            cityDeltaTemps[c] = [];
        }
    );
    data.filter((d) => (d.time.startsWith(ctx.REFERENCE_YEAR))).forEach(
        function (date_record) {
            CITY_NAMES.forEach(
                function (c) {
                    ctx.cityRefTemps[c].push(parseFloat(date_record[c]));
                }
            );
        }
    );
    data.forEach(
        function (date_record) {
            temperatureSeries.dates.push(date_record.time);
            CITY_NAMES.forEach(
                function (city) {
                    let delta = parseFloat(date_record[city]) - getReferenceTemp(city, getMonth(date_record.time));
                    cityDeltaTemps[city].push(delta);
                }
            );
        }
    );
    CITY_NAMES.forEach(
        function (c) {
            temperatureSeries.series.push({ name: c, values: cityDeltaTemps[c] });
        }
    );
    return temperatureSeries;
};

function createViz() {
    console.log("Using D3 v" + d3.version);
    let svgEl = d3.select("#main").append("svg");
    svgEl.attr("width", ctx.w);
    svgEl.attr("height", ctx.h);
    var mainG = svgEl.append("g").attr("id", "mainG");
    mainG.append("g").attr("id", "carteG")
                    .attr("width", ctx.carte_w)
                    .attr("height", ctx.carte_h);
    mainG.append("g").attr("id", "timelineG")
                    .attr("width", ctx.timeline_w)
                    .attr("height", ctx.timeline_h)
                    .attr("transform", `translate(${ctx.carte_w}, 0)`);
    mainG.append("g").attr("id", "detailsG")
                    .attr("width", ctx.details_w)
                    .attr("height", ctx.details_h)
                    .attr("transform", `translate(${ctx.carte_w}, ${ctx.timeline_h})`);
    loadData();
};

function loadData() {
    // data source: https://www.kaggle.com/datasets/garrickhague/temp-data-of-prominent-us-CITY_NAMES-from-1948-to-2022
    d3.csv("data/US_City_Temp_Data.csv").then(function (data) {
        // a mettre 
    }).catch(function (error) { console.log(error) });
};
