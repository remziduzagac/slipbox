# Splits a multi-day track (routes/300k-lakes-loop.gpx) into a file per day,
# and says each day, for a row in rides.csv.
require "nokogiri"
require "csv"

module Rides
  class Splitter
    USAGE = <<~TEXT
      gpx_split.rb TRACK.gpx
      Writes TRACK-day1.gpx, TRACK-day2.gpx, ...
    TEXT

    def initialize(path)
      @path = path
    end

    def days
      doc = Nokogiri::XML(File.read(@path))
      doc.css("trkpt").group_by { |pt| pt.at("time").text[0, 10] }
    end

    def self.run(argv)
      abort USAGE if argv.empty?
      new(argv.first).days.each_key { |day| puts day }
    end
  end
end

Rides::Splitter.run(ARGV) if $PROGRAM_NAME == __FILE__
