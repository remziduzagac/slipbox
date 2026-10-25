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

  post_install_steps do
    run "slipbox", args: ["skill", "--auto"], base: :bin, print_stdout: true, must_succeed: false
  end

  def caveats
    <<~EOS
      Agent skill destinations and any refusals are reported during installation.
      If a user skill could not be installed, run: slipbox skill --auto
      HOMEBREW_SLIPBOX_NO_SKILL=1 skips automatic skill installation and refresh.
    EOS
  end

  test do
    assert_equal "slipbox #{version}", shell_output("#{bin}/slipbox --version").strip
  end
end
