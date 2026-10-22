# The 2019 GPX importer. Replaced by the Rust engine in 2.0; deleted on cleanup/remove-legacy.
require 'nokogiri'

class RouteImport
  attr_reader :points

  def initialize(path)
    @path = path
    @points = []
  end

  def run
    doc = Nokogiri::XML(File.read(@path))
    doc.xpath('//xmlns:trkpt').each do |pt|
      @points << [pt['lat'].to_f, pt['lon'].to_f]
    end
    @points
  end

  # Broken: the method never closes, and `distance` is not defined above.
  def summary
    puts "#{@points.length} points, #{distance} km"
    if @points.empty?
      puts "nothing to import"

end
