# What's in this repo?

I create a lot of Quarto "books" that are rendered in to HTML. I often use these
as the textbook for college level courses that I teach. I want a way to persist my coverage
of the textbook in the classes that I teach so that students can easily see what we've
covered already.

This repo is to develop that feature that I can add to my Quarto books.
I then plan to merge this approach into the books that I've written. 
Therefore the code should be easy to copy and move to other Quarto books.

## docs folder is for project documentation - it is a Quarto book

The docs folder contains documentation. Please put all new docs in that folder.
The docs folder itself should be maintained as a Quarto book to make it easy
for me to see the docs as I'm developing. The docs should always be kept 
up to date with any changes that are made to the code.


## multiple class sections being taught in the same semester

The method developed in this project should allow for keeping different coverage 
info for different sections that I teach of the same course. 

## should be hostable on github pages

I often host these books on github pages. I would therefore, at least
initially, not be required to create more infrastructure. I envision a 
javascript based addon to Quarto that can reference the persisted coverage
history. To do this , perhaps the coverage history can be placed in files 
or a sqlite database instead of a database that would need hosting.

If it's not possible for javascript to write to these files from the website
that is probably ok as I can update the coverage info offline and then republish 
the coverage data on github pages.

At a later point, I might revisit this and allow for using a hosted database
or other tech that requires more infrastructure than just github pages.

## Possible implementation

Since these are Quarto books, the various headers in the book can all be 
tagged with an HTML id using syntax such as : ## My Section Header {#sec-my-id}
The URL of a page and the ids for the sections that were covered in that 
page could then be persisted. There are some edge cases here but this approach
should suffice for now.

## UI to show coverage of material

### highlighting

I envision other javascript and CSS that would highlight to the reader the
sections that have been covered already in class. For example, shading the 
covered sections in a very light green background color. 

### different college course sections 

If there are more than one college course section that I am teaching, the 
user should be forced to pick their section when first navigating to the 
site before the material is available to read. I envision this with 
a dropdown list to pick the section. Once the user picks their section the
material should  become readable to them. I think a good UI feature would
be to blur the website until they pick a section and not block the website
entirely. I'm not sure if that is possible ...

### perhaps a different UI for the professor. 

There should also be a feature for me - the professor - to choose multiple
sections. The UI should then have some way to indicate which sections covered
which material - e.g. perhaps material covered by all sections should be 
green - material covered by only some of the sections should have a different
colors displayed as the background for the first few letters or words with the background
colors indicating which sections covered the material (a different color for each 
section that is pickable by me when I first go to the website). I'm not sure
how to do this exactly - these are just initial ideas ...

Perhaps the professor can add a GET URL parameter to the url to indicate that he is the
professor. That way the professor doesn't have to advertise the feature to the 
students - but can use it himself by just adding the variable, e.g.

https://somebook.github.io/?prof=true
