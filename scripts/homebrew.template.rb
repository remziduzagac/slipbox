# slipbox's Homebrew formula (plan 14.3), made for one release by scripts/release.ts: its version, and each pack's
# address and SHA-256, written in. .github/workflows/homebrew.yml puts it in the tap once the release is published.
class Slipbox < Formula
  desc "Read, review and edit what your coding agent writes, in your terminal"
  homepage "https://github.com/@REPO@"
  version "@VERSION@"
  license "Apache-2.0"

@PLATFORMS@

  def install
    bin.install "slipbox"
    doc.install "NOTICES.txt"
  end

  test do
    assert_equal "slipbox #{version}", shell_output("#{bin}/slipbox --version").strip
  end
end
