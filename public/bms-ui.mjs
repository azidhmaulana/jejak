export const hudContents=(markers=false)=>'<span class="hud-line"></span>'+(markers?'<i></i><i></i><i></i>':'');
export const hudAccent=(markers=false)=>'<span class="fr26-hud-accent" aria-hidden="true">'+hudContents(markers)+'</span>';
