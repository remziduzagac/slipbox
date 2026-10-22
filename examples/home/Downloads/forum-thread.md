# Re: [kestrel-users] Offline maps keep re-downloading

Exported from the users list archive. The thread was long, and the mail client nested every reply.

>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> I have the same problem on 2.2.1, the Alps offline map downloads again every time I open the app

And the end of that thread, a checklist someone indented at every reply:

- +1, same on Android
  - cleared the cache, it still re-downloads
    - happens on wifi only for me
      - Pixel 7, app version 2.2.1
        - not on iOS, I just checked
          - did you turn off battery optimisation?
            - yes, no change
              - it stopped after I reinstalled
                - for how long? mine came back after a day
                  - mine came back after an hour
                    - are you on the beta channel?
                      - no, the store release
                        - the storage is half empty, so it is not that
                          - which region are you downloading?
                            - Alps and the Pyrenees, about 1.4 GB
                              - that explains a lot, I only have 600 MB
                                - the app says offline but downloads anyway
                                  - same, I turned on airplane mode to stop it
                                    - does the SD card count as storage?
                                      - it does on my phone
                                        - are the tiles in the card folder?
                                          - they are, 0 bytes each
                                            - that looks like the bug, thanks
                                              - filed it, ticket link in the next mail
                                                - the ticket is private, can you paste it?
                                                  - here it is, #4688
                                                    - I added my log to it
                                                      - mine says lease expired in the log
                                                        - that is a different bug, I think
                                                          - Aiko says it is the same root cause
                                                            - good to know, thanks Aiko
                                                              - will 2.3 fix it?
                                                                - the release notes say sync is rewritten
                                                                  - so maybe
                                                                    - I will test the beta tonight
                                                                      - report back please
                                                                        - still re-downloading on 2.3 beta 2
                                                                          - beta 3 is out, try that
                                                                            - beta 3 fixed it for me
                                                                              - confirmed on Pixel 8 as well
                                                                                - iOS here, never saw the problem
                                                                                  - lucky you
                                                                                    - are you on cellular?
                                                                                      - yes, unlimited data
                                                                                        - then you will not notice
                                                                                          - I noticed the battery drain instead
                                                                                            - the battery drain is the same bug
                                                                                              - makes sense, it never finishes
                                                                                                - can we get a progress bar for this?
                                                                                                  - the tracker has a feature request already
                                                                                                    - linked it in the ticket
                                                                                                      - thanks all, I will mark the thread as solved
                                                                                                        - not solved until 2.3 ships
                                                                                                          - fair, I will wait
                                                                                                            - the ship date is 30 September
                                                                                                              - I saw, thanks
                                                                                                                - in the meantime delete the Alps pack and add it again
                                                                                                                  - tried that twice, no change
                                                                                                                    - try deleting the app data as well
                                                                                                                      - that works but loses my routes
                                                                                                                        - the routes are synced to your account
                                                                                                                          - only if sync is on, mine was off
                                                                                                                            - then export them first
                                                                                                                              - how do I export?
                                                                                                                                - menu, then routes, then export all as GPX
                                                                                                                                  - found it, thanks
                                                                                                                                    - did it work?
                                                                                                                                      - yes, the pack downloaded once and stayed
                                                                                                                                        - great, closing my notes on this
                                                                                                                                          - for the archive: clear data, then re-add the packs
                                                                                                                                            - for the archive: it is the storage bug, not wifi
                                                                                                                                              - for the archive: 2.3 beta 3 fixes it too
                                                                                                                                                - please do not close the thread yet
                                                                                                                                                  - why not?
                                                                                                                                                    - other users will find it in search
                                                                                                                                                      - good point, leaving it open
                                                                                                                                                        - bumping for the weekend crowd
                                                                                                                                                          - the weekend crowd says hello
                                                                                                                                                            - hello from the Alps, offline maps working
                                                                                                                                                              - enjoy the ride
                                                                                                                                                                - see you on the next list digest
                                                                                                                                                                  - unsubscribing, thanks for the help
                                                                                                                                                                    - bye
                                                                                                                                                                      - bye, and thanks
                                                                                                                                                                        - one last thing: how big is the 2.3 pack?
                                                                                                                                                                          - a bit smaller, they changed the tile format
                                                                                                                                                                            - good, my phone is full
                                                                                                                                                                              - send a screenshot of your storage screen
                                                                                                                                                                                - sent in private
                                                                                                                                                                                  - got it, you have 90 MB free, that is the problem
                                                                                                                                                                                    - oh
                                                                                                                                                                                      - free some space and try again
                                                                                                                                                                                        - freed 2 GB, it works
                                                                                                                                                                                          - great, now it is solved for real
                                                                                                                                                                                            - solved, finally
                                                                                                                                                                                              - thread archived by the moderators
                                                                                                                                                                                                - thanks, that saved me an evening
                                                                                                                                                                                                  - for what it is worth, same here
                                                                                                                                                                                                    - let us know how the beta goes
                                                                                                                                                                                                      - I will add this to the support wiki

A mix, from the digest of the same list:

> Does anyone know why the maps re-download?
> - I think it is the storage check.
> > > It started with the 2.2 update.
> > > - Which phone do you have?
> > > > > A Pixel 7, with 600 MB free.
> > > > > - That is probably not enough for the Alps pack.
> > > > > > > The pack is 1.4 GB, it says so on the download screen.
> > > > > > > - I did not see that screen.
> > > > > > > > > It is under Settings, then Offline maps, then Details.
> > > > > > > > > - Found it, thanks.
> > > > > > > > > > > So I need more space, not a new phone.
> > > > > > > > > > > - Yes, and the 2.3 release will say so in the app.

Narrow screens kept breaking these, so the original poster pasted this:

I was on the train with the Android app open and the offline map for the whole of Switzerland started downloading again from zero for the third time this week, even though the phone was on wifi.
